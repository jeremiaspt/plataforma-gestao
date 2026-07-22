import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { dateToWeekday, overlapsExistingBlock, parseDateInput, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { sendSubstitutionRequestEmail } from "@/lib/substitutionEmail";
import { appRedirectUrl } from "@/lib/url";

type ValidationMessage = {
  status: "ok" | "error";
  label: string;
  message: string;
};

function encodeValidation(messages: ValidationMessage[]) {
  return Buffer.from(JSON.stringify(messages)).toString("base64url");
}

function redirectPath(request: Request, status: "success" | "error", dateValue: string, teacherId?: string, messages?: ValidationMessage[]) {
  const params = new URLSearchParams({ [status]: "1" });

  if (dateValue) {
    params.set("date", dateValue);
  }

  if (teacherId) {
    params.set("teacherId", teacherId);
  }

  if (messages?.length) {
    params.set("validation", encodeValidation(messages));
  }

  return NextResponse.redirect(appRedirectUrl(`/substituicoes?${params.toString()}`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const dateValue = String(formData.get("date") || "");
  const selectedTeacherId = String(formData.get("teacherId") || "");
  const absentTeacherId = isAdmin ? selectedTeacherId : user.id;
  const substitutionDate = parseDateInput(dateValue);
  const selectedBlockIds = Array.from(new Set(formData.getAll("poolBlockId").map(String).filter(Boolean)));
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/substituicoes?date=${dateValue}` });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  const validationMessages: ValidationMessage[] = [];

  if (!substitutionDate) {
    validationMessages.push({ status: "error", label: "Data", message: "A data selecionada não é válida." });
  }

  if (!absentTeacherId) {
    validationMessages.push({ status: "error", label: "Professor em falta", message: "Não foi possível identificar o professor em falta." });
  }

  if (selectedBlockIds.length === 0) {
    validationMessages.push({ status: "error", label: "Aulas", message: "Seleciona pelo menos uma aula para substituir." });
  }

  if (validationMessages.length > 0 || !substitutionDate) {
    return redirectPath(request, "error", dateValue, selectedTeacherId, validationMessages);
  }

  const absentTeacher = await prisma.user.findFirst({
    where: {
      id: absentTeacherId,
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    select: { id: true }
  });

  if (!absentTeacher) {
    return redirectPath(request, "error", dateValue, selectedTeacherId, [
      { status: "error", label: "Professor em falta", message: "O professor em falta não existe, está inativo ou não tem categoria professor." }
    ]);
  }

  const weekday = dateToWeekday(substitutionDate);
  const blocks = await prisma.poolScheduleBlock.findMany({
    where: {
      id: { in: selectedBlockIds },
      active: true,
      teacherId: absentTeacherId,
      type: "aula",
      weekday
    }
  });

  if (blocks.length !== selectedBlockIds.length || blocks.some((block) => !poolBlockAppliesToDate(block, substitutionDate))) {
    return redirectPath(request, "error", dateValue, selectedTeacherId, [
      { status: "error", label: "Aulas selecionadas", message: "Uma ou mais aulas selecionadas já não existem ou não se aplicam à data escolhida." }
    ]);
  }

  const substituteIds = Array.from(
    new Set(blocks.map((block) => String(formData.get(`substituteTeacherId_${block.id}`) || "")).filter(Boolean))
  );
  const substitutes = await prisma.user.findMany({
    where: {
      id: { in: substituteIds },
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    select: { id: true, email: true, name: true }
  });
  const validSubstituteIds = new Set(substitutes.map((teacher) => teacher.id));
  const substitutesById = new Map(substitutes.map((teacher) => [teacher.id, teacher]));

  const substituteBlocks = await prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      teacherId: { in: substituteIds },
      type: "aula",
      weekday
    }
  });
  const existingSubstitutionItems = await prisma.groupClassSubstitutionItem.findMany({
    where: {
      status: { in: ["pending", "approved"] },
      substituteTeacherId: { in: substituteIds },
      request: {
        status: { in: ["pending", "approved"] },
        substitutionDate
      }
    },
    select: {
      endMinutes: true,
      startMinutes: true,
      substituteTeacherId: true
    }
  });

  const items = [];

  for (const block of blocks) {
    const substituteTeacherId = String(formData.get(`substituteTeacherId_${block.id}`) || "");
    const accumulation = formData.get(`accumulation_${block.id}`) === "on";
    const blockLabel = `${block.title} · ${Math.floor(block.startMinutes / 60).toString().padStart(2, "0")}:${(block.startMinutes % 60).toString().padStart(2, "0")} - ${Math.floor(block.endMinutes / 60).toString().padStart(2, "0")}:${(block.endMinutes % 60).toString().padStart(2, "0")}`;

    if (!substituteTeacherId || substituteTeacherId === absentTeacherId || !validSubstituteIds.has(substituteTeacherId)) {
      validationMessages.push({
        status: "error",
        label: blockLabel,
        message: !substituteTeacherId
          ? "Falta selecionar o professor substituto."
          : substituteTeacherId === absentTeacherId
            ? "O professor em falta não pode ser o próprio substituto."
            : "O professor substituto não existe, está inativo ou não tem categoria professor."
      });
      continue;
    }

    const substituteHasScheduleConflict = substituteBlocks.some(
      (candidate) =>
        candidate.teacherId === substituteTeacherId &&
        poolBlockAppliesToDate(candidate, substitutionDate) &&
        overlapsExistingBlock({
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          existingStart: candidate.startMinutes,
          existingEnd: candidate.endMinutes
        })
    );
    const substituteHasSubstitutionConflict = existingSubstitutionItems.some(
      (candidate) =>
        candidate.substituteTeacherId === substituteTeacherId &&
        overlapsExistingBlock({
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          existingStart: candidate.startMinutes,
          existingEnd: candidate.endMinutes
        })
    );
    const substituteHasConflict = substituteHasScheduleConflict || substituteHasSubstitutionConflict;

    if (substituteHasConflict && !isAdmin) {
      validationMessages.push({
        status: "error",
        label: blockLabel,
        message:
          "O professor substituto jÃ¡ tem aula nesse horÃ¡rio. O pedido de substituiÃ§Ã£o com acumulaÃ§Ã£o tem de ser pedido ao Diretor ou Coordenador, uma vez que sÃ³ com autorizaÃ§Ã£o a substituiÃ§Ã£o pode ser feita."
      });
      continue;
    }

    if (accumulation && !isAdmin) {
      validationMessages.push({
        status: "error",
        label: blockLabel,
        message:
          "A acumulaÃ§Ã£o sÃ³ pode ser lanÃ§ada por um administrador. Este pedido deve ser encaminhado ao Diretor ou Coordenador para autorizaÃ§Ã£o."
      });
      continue;
    }

    if (substituteHasConflict && !accumulation) {
      validationMessages.push({
        status: "error",
        label: blockLabel,
        message: "O professor substituto já tem aula nesse horário. Marca a opção Acumulação se for intencional."
      });
      continue;
    }

    const substitute = substitutesById.get(substituteTeacherId);
    validationMessages.push({
      status: "ok",
      label: blockLabel,
      message: `OK para ${substitute?.name || "professor selecionado"}${accumulation ? " com acumulação" : ""}.`
    });

    items.push({
      accumulation,
      endMinutes: block.endMinutes,
      laneNumber: block.laneNumber,
      notes: block.notes,
      poolKey: block.poolKey,
      poolScheduleBlockId: block.id,
      startMinutes: block.startMinutes,
      status: isAdmin ? "approved" : "pending",
      substituteTeacherId,
      title: block.title
    });
  }

  if (validationMessages.some((message) => message.status === "error")) {
    return redirectPath(request, "error", dateValue, selectedTeacherId, validationMessages);
  }

  const substitutionRequest = await prisma.groupClassSubstitutionRequest.create({
    data: {
      absentTeacherId,
      requestedById: user.id,
      status: isAdmin ? "approved" : "pending",
      substitutionDate,
      items: { createMany: { data: items } }
    },
    include: {
      absentTeacher: { select: { name: true } },
      items: true
    }
  });

  if (!isAdmin) {
    const actionUrl = appRedirectUrl(`/substituicoes?tab=gerir&date=${dateValue}`, request).toString();
    const itemsBySubstitute = new Map<string, typeof substitutionRequest.items>();

    for (const item of substitutionRequest.items) {
      const substituteItems = itemsBySubstitute.get(item.substituteTeacherId) || [];
      substituteItems.push(item);
      itemsBySubstitute.set(item.substituteTeacherId, substituteItems);
    }

    await Promise.all(
      Array.from(itemsBySubstitute.entries()).map(([substituteTeacherId, substituteItems]) => {
        const substituteTeacher = substitutesById.get(substituteTeacherId);

        if (!substituteTeacher) {
          return Promise.resolve();
        }

        return sendSubstitutionRequestEmail({
          requestId: substitutionRequest.id,
          absentTeacherName: substitutionRequest.absentTeacher.name,
          substituteTeacherEmail: substituteTeacher.email,
          substituteTeacherName: substituteTeacher.name,
          substitutionDate,
          items: substituteItems,
          actionUrl
        });
      })
    );
  }

  return redirectPath(request, "success", dateValue, selectedTeacherId);
}
