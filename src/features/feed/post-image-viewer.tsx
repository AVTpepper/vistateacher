"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, X } from "lucide-react";
import Image from "next/image";

export function PostImageViewer({ src }: { src: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="View shared image full screen"
          className="bg-muted group relative mx-4 mb-3 block aspect-video w-[calc(100%-2rem)] cursor-zoom-in overflow-hidden rounded-lg"
        >
          <Image
            src={src}
            alt="Shared post image"
            fill
            sizes="(max-width: 768px) calc(100vw - 2rem), 640px"
            unoptimized
            className="object-contain"
          />
          <span className="bg-background/85 text-foreground absolute right-2 bottom-2 grid size-9 place-items-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 aria-hidden="true" className="size-4" />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-70 p-3 outline-none sm:p-6">
          <Dialog.Title className="sr-only">Shared post image</Dialog.Title>
          <Dialog.Description className="sr-only">
            Full-screen view of the image shared with this post.
          </Dialog.Description>
          <div className="relative size-full">
            <Image
              src={src}
              alt="Shared post image, full screen"
              fill
              sizes="100vw"
              unoptimized
              className="object-contain"
            />
          </div>
          <Dialog.Close
            aria-label="Close full-screen image"
            className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 sm:top-5 sm:right-5"
          >
            <X aria-hidden="true" className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
