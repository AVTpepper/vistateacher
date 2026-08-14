"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FormDialogContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <Dialog.Content
        className={cn(
          "bg-card fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl border shadow-2xl sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2",
          className,
        )}
      >
        <div className="shrink-0 px-5 pt-5 pr-16 sm:px-6 sm:pt-6 sm:pr-16">
          <Dialog.Title className="font-serif text-2xl">{title}</Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            {description}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label={`Close ${title.toLowerCase()}`}
          className="text-muted-foreground hover:bg-muted absolute top-2.5 right-2.5 grid size-11 cursor-pointer place-items-center rounded-lg"
        >
          <X aria-hidden="true" className="size-4" />
        </Dialog.Close>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer && (
          <div className="bg-card shrink-0 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
