"use client";

import { useEffect } from "react";

export function BirthdayPartyDialog() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const openButton = target?.closest<HTMLButtonElement>("[data-open-birthday-dialog]");
      const closeButton = target?.closest<HTMLButtonElement>("[data-close-birthday-dialog]");

      if (openButton) {
        const dialog = document.getElementById(openButton.dataset.openBirthdayDialog || "") as HTMLDialogElement | null;
        dialog?.showModal();
      }

      if (closeButton) {
        closeButton.closest<HTMLDialogElement>("dialog")?.close();
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
