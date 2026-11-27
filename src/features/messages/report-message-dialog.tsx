"use client";

import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportContentDialog } from "@/features/moderation/report-content-dialog";
import type { DirectMessage } from "@/lib/messages/server";

export function ReportMessageDialog({ message }: { message: DirectMessage }) {
  return (
    <ReportContentDialog
      title="Report message"
      endpoint={`/api/messages/${message.conversationId}/report`}
      payload={{ messageId: message.id }}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Report message"
          title="Report message"
        >
          <Flag aria-hidden="true" />
        </Button>
      }
    />
  );
}
