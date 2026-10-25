"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { deleteSession } from "@/lib/db";

export function DeleteSessionButton({ id, onDeleted, compact }: { id: string; onDeleted: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className={compact ? "!p-0 text-xs text-red-600 hover:!bg-transparent hover:underline" : "text-red-600"}
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Delete this session? The video, transcript and report will be permanently removed from this device.")) return;
        setBusy(true);
        try {
          await deleteSession(id);
          onDeleted();
        } catch (err) {
          window.alert(`Couldn't delete: ${err instanceof Error ? err.message : err}`);
          setBusy(false);
        }
      }}
    >
      {busy ? "Deleting…" : "Delete session"}
    </Button>
  );
}
