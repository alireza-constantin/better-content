"use client";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBackdrop,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogViewport,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ContentDocumentV3 } from "../domain";
import { BlockProductionDirections } from "./block-production-directions";
import {
  addBlock,
  deleteBlock,
  mergeBlock,
  moveBlock,
  pasteIntoBlock,
  replaceBlockText,
  splitBlock,
} from "./script-block-operations";

type Props = Readonly<{
  document: ContentDocumentV3;
  workspaceId: string;
  language: "en" | "fa";
  disabled?: boolean;
  onChange: (document: ContentDocumentV3) => void;
  labels: Readonly<{
    region: string;
    block: string;
    add: string;
    moveUp: string;
    moveDown: string;
    remove: string;
    deleteTitle: string;
    deleteDescription: string;
    cancel: string;
    confirm: string;
  }>;
}>;
type FocusTarget = Readonly<{ id: string; caret?: number }>;

export function StructuredScriptEditor({
  document,
  workspaceId,
  language,
  disabled = false,
  onChange,
  labels,
}: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const focusTarget = useRef<FocusTarget | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const dir = language === "fa" ? "rtl" : "ltr";
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const element = textareas.current.get(target.id);
    if (element) {
      element.focus();
      const caret = target.caret ?? element.value.length;
      element.setSelectionRange(caret, caret);
    }
    focusTarget.current = null;
  }, [document]);
  const apply = (next: ContentDocumentV3 | null, target?: FocusTarget) => {
    if (!next || disabled) return;
    if (target) focusTarget.current = target;
    onChange(next);
  };
  const remove = (id: string) => {
    const index = document.script.blocks.findIndex((block) => block.id === id);
    const next = deleteBlock(document, id);
    const neighbor = document.script.blocks[index + 1] ?? document.script.blocks[index - 1];
    apply(next, neighbor ? { id: neighbor.id } : undefined);
    setDeleteId(null);
  };
  return (
    <section
      aria-label={labels.region}
      className="rounded-xl border border-border/80 bg-background px-3 py-4 shadow-xs sm:px-5"
      dir={dir}
      lang={language}
    >
      <ol className="space-y-2" aria-label={labels.region}>
        {document.script.blocks.map((block, index) => (
          <li
            className="group relative rounded-lg px-1 py-1 focus-within:bg-muted/45 hover:bg-muted/35"
            key={block.id}
          >
            <div className="flex items-start gap-1.5">
              <span
                aria-hidden="true"
                className="mt-3 w-5 shrink-0 text-end text-xs tabular-nums text-muted-foreground"
              >
                {index + 1}
              </span>
              <textarea
                aria-label={`${labels.block} ${index + 1} ${labels.region}`}
                className="field-sizing-content min-h-12 flex-1 resize-none border-0 bg-transparent py-2 text-base leading-7 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                data-block-id={block.id}
                dir={dir}
                disabled={disabled}
                lang={language}
                maxLength={50_000}
                onChange={(event) =>
                  apply(replaceBlockText(document, block.id, event.target.value))
                }
                onCompositionStart={() => {}}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const next = splitBlock(
                      document,
                      block.id,
                      target.selectionStart,
                      target.selectionEnd,
                    );
                    const trailing = next?.script.blocks[index + 1];
                    apply(next, trailing ? { id: trailing.id, caret: 0 } : undefined);
                  } else if (
                    event.key === "Backspace" &&
                    event.currentTarget.selectionStart === 0 &&
                    event.currentTarget.selectionEnd === 0 &&
                    index > 0
                  ) {
                    event.preventDefault();
                    const boundary = document.script.blocks[index - 1].text.length;
                    apply(mergeBlock(document, block.id), {
                      id: document.script.blocks[index - 1].id,
                      caret: boundary,
                    });
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!/[\r\n]/.test(text)) return;
                  event.preventDefault();
                  const target = event.currentTarget;
                  apply(
                    pasteIntoBlock(
                      document,
                      block.id,
                      target.selectionStart,
                      target.selectionEnd,
                      text,
                    ),
                  );
                }}
                ref={(element) => {
                  if (element) textareas.current.set(block.id, element);
                  else textareas.current.delete(block.id);
                }}
                rows={1}
                spellCheck
                value={block.text}
              />
              <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <Button
                  aria-label={labels.moveUp}
                  disabled={disabled || index === 0}
                  onClick={() => apply(moveBlock(document, block.id, -1), { id: block.id })}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <ChevronUpIcon />
                </Button>
                <Button
                  aria-label={labels.moveDown}
                  disabled={disabled || index === document.script.blocks.length - 1}
                  onClick={() => apply(moveBlock(document, block.id, 1), { id: block.id })}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDownIcon />
                </Button>
                <Button
                  aria-label={labels.remove}
                  disabled={disabled}
                  onClick={(event) => {
                    deleteTrigger.current = event.currentTarget;
                    if (
                      block.text.length ||
                      block.performanceDirections.length ||
                      block.editDirections.length
                    )
                      setDeleteId(block.id);
                    else remove(block.id);
                  }}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
            <BlockProductionDirections
              block={block}
              disabled={disabled}
              document={document}
              workspaceId={workspaceId}
              language={language}
              onChange={(next) => {
                if (next.schemaVersion === 3) onChange(next);
              }}
            />
          </li>
        ))}
      </ol>
      <Button
        className="mt-3 min-h-10"
        disabled={disabled}
        onClick={() => {
          const next = addBlock(document);
          const added = next?.script.blocks.at(-1);
          apply(next, added ? { id: added.id, caret: 0 } : undefined);
        }}
        type="button"
        variant="ghost"
      >
        <PlusIcon data-icon="inline-start" />
        {labels.add}
      </Button>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && deleteId) {
            setDeleteId(null);
            deleteTrigger.current?.focus();
          }
        }}
        open={deleteId !== null}
      >
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogViewport>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.deleteTitle}</AlertDialogTitle>
                <AlertDialogDescription>{labels.deleteDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (deleteId) remove(deleteId);
                  }}
                >
                  {labels.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogViewport>
        </AlertDialogPortal>
      </AlertDialog>
    </section>
  );
}
