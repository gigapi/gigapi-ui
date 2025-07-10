import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useAtom } from "jotai";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Database, Table, Columns3, Send } from "lucide-react";
import { availableDatabasesAtom, tablesListForAIAtom } from "@/atoms";
import type { ChatContext, ColumnSchema } from "@/types/chat.types";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  context: ChatContext;
}

interface MentionItem {
  type: "database" | "table" | "column";
  value: string;
  database?: string;
  table?: string;
  schema?: ColumnSchema[];
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Ask about your data...",
  context,
}: ChatInputProps) {
  const [databases] = useAtom(availableDatabasesAtom);
  const [tables] = useAtom(tablesListForAIAtom);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Build mention items based on search
  const buildMentionItems = (): MentionItem[] => {
    const items: MentionItem[] = [];
    const search = mentionSearch.toLowerCase();

    // Add databases
    databases
      .filter((db) => db.toLowerCase().includes(search))
      .forEach((db) => {
        items.push({ type: "database", value: db });

        // Add tables for this database if it's selected
        if (context.databases.selected.includes(db) && tables[db]) {
          tables[db]
            .filter((table: string) => table.toLowerCase().includes(search))
            .forEach((table: string) => {
              items.push({ type: "table", value: table, database: db });

              // Add columns if schema is available
              const schema = context.schemas?.[db]?.[table];
              if (schema) {
                schema
                  .filter((col) =>
                    col.column_name.toLowerCase().includes(search)
                  )
                  .forEach((col) => {
                    items.push({
                      type: "column",
                      value: col.column_name,
                      database: db,
                      table,
                      schema: [col],
                    });
                  });
              }
            });
        }
      });

    return items;
  };

  const mentionItems = buildMentionItems();

  // Handle text change and detect @ mentions
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    setCursorPosition(newCursorPos);

    // Check if @ was typed
    const lastChar = newValue[newCursorPos - 1];
    if (lastChar === "@") {
      setShowMentions(true);
      setMentionSearch("");
      setSelectedIndex(0);
    } else if (showMentions) {
      // Update mention search
      const atIndex = newValue.lastIndexOf("@", newCursorPos - 1);
      if (atIndex !== -1) {
        const searchText = newValue.substring(atIndex + 1, newCursorPos);
        if (searchText.includes(" ")) {
          setShowMentions(false);
        } else {
          setMentionSearch(searchText);
          setSelectedIndex(0);
        }
      }
    }

    onChange(newValue);
  };

  // Handle mention selection
  const selectMention = (item: MentionItem) => {
    if (!textareaRef.current) return;

    const text = value;
    const atIndex = text.lastIndexOf("@", cursorPosition - 1);
    if (atIndex === -1) return;

    // Build mention text
    let mentionText = "";
    if (item.type === "database") {
      mentionText = `@${item.value}`;
    } else if (item.type === "table") {
      mentionText = `@${item.database}.${item.value}`;
    } else if (item.type === "column") {
      mentionText = `@${item.database}.${item.table}.${item.value}`;
    }

    // Replace @search with mention
    const before = text.substring(0, atIndex);
    const after = text.substring(cursorPosition);
    const newText = before + mentionText + " " + after;

    onChange(newText);
    setShowMentions(false);

    // Focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = atIndex + mentionText.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < mentionItems.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : mentionItems.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (mentionItems[selectedIndex]) {
          selectMention(mentionItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowMentions(false);
        break;
    }
  };

  // Close mentions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showMentions &&
        !(e.target instanceof Element && e.target.closest(".mention-popover"))
      ) {
        setShowMentions(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showMentions]);

  return (
    <div className="relative flex gap-3 items-end">
      <div className="flex-1 relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="resize-none min-h-[44px] max-h-32 pr-10"
          rows={1}
        />

        {/* Mention helper text */}
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
          Type @ to mention
        </div>
      </div>

      <Button onClick={onSend} disabled={disabled || !value.trim()} size="icon">
        <Send className="w-4 h-4" />
      </Button>

      {/* Mentions Popover */}
      {showMentions && mentionItems.length > 0 && (
        <div className="mention-popover absolute z-50 w-96 bg-popover border rounded-lg shadow-lg bottom-full mb-2 left-0">
          <ScrollArea className="max-h-64 w-full">
            {" "}
            {/* Changed from max-h-124 to max-h-64 */}
            <div className="p-2">
              <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                Select item to mention
              </div>
              {mentionItems.map((item, index) => (
                <button
                  key={`${item.type}-${item.value}-${item.database}-${item.table}`}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors ${
                    index === selectedIndex ? "bg-accent" : ""
                  }`}
                  onClick={() => selectMention(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center gap-2">
                    {item.type === "database" && (
                      <Database className="w-4 h-4 text-blue-500" />
                    )}
                    {item.type === "table" && (
                      <Table className="w-4 h-4 text-green-500" />
                    )}
                    {item.type === "column" && (
                      <Columns3 className="w-4 h-4 text-purple-500" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.value}
                      </div>
                      {item.database && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.database}
                          {item.table && ` → ${item.table}`}
                        </div>
                      )}
                    </div>

                    {item.type === "column" && item.schema?.[0] && (
                      <Badge variant="outline" className="text-xs">
                        {item.schema[0].column_type}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
