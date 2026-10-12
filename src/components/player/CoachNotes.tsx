import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BadgeCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePlayerRemarks } from "@/hooks/use-player-profile";
import { useDashboard } from "@/lib/dashboard-context";
import { noteAuthor } from "@/lib/students/profile-stats";
import { createRemark, deleteRemark, playerKeys } from "@/lib/player-profile";
import { EmptyLine, Skel } from "./parts";

export function CoachNotes({ tenantId, studentId }: { tenantId: string; studentId: string }) {
  const qc = useQueryClient();
  const { session, profile } = useDashboard();
  const authorName = noteAuthor(session.user.user_metadata, profile.role);
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const list = usePlayerRemarks(studentId);

  const add = useMutation({
    mutationFn: () =>
      createRemark({
        tenant_id: tenantId,
        student_id: studentId,
        remark: text.trim(),
        author_name: authorName,
        visible_to_parents: visible,
      }),
    onSuccess: () => {
      setText("");
      setVisible(false);
      qc.invalidateQueries({ queryKey: playerKeys.remarks(studentId) });
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: deleteRemark,
    onSuccess: () => qc.invalidateQueries({ queryKey: playerKeys.remarks(studentId) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const notes = list.data ?? [];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a coach note…"
          rows={2}
          className="border-0 focus-visible:ring-0 shadow-none resize-none px-2"
        />
        <div className="flex items-center justify-between px-1 pb-0.5">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="size-3.5 accent-current"
            />
            Visible to parent
          </label>
          <Button
            size="sm"
            disabled={!text.trim() || add.isPending}
            onClick={() => add.mutate()}
            className="h-8"
          >
            {add.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}{" "}
            Add
          </Button>
        </div>
      </div>

      {list.isLoading ? (
        <Skel />
      ) : notes.length === 0 ? (
        <EmptyLine text="No coach notes yet." />
      ) : (
        <ul className="divide-y divide-border">
          {notes.map((r) => (
            <li key={r.id} className="py-2.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm whitespace-pre-wrap break-words">{r.remark}</div>
                <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <span>{r.author_name ?? "Coach"}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  {r.visible_to_parents ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="size-3" /> Parent
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                aria-label="Delete note"
                onClick={() => del.mutate(r.id)}
                className="grid place-items-center size-7 rounded-full hover:bg-accent text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
