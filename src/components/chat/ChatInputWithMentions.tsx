import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Database, Search, Table, AtSign, Bot } from "lucide-react";
import { useAtom } from "jotai";
import { schemaCacheAtom } from "@/atoms/database-atoms";
import { aiConnectionsAtom } from "@/atoms/chat-atoms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatSession } from "@/types/chat.types";

interface ChatInputWithMentionsProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  session: ChatSession;
  onConnectionChange: (connectionId: string) => void;
  isAgentic?: boolean;
  onAgenticToggle?: (isAgentic: boolean) => void;
}

interface MentionItem {
  type: "database" | "table";
  value: string;
  database?: string;
  description?: string;
  columnCount?: number;
  isAmbiguous?: boolean;
}

export default function ChatInputWithMentions({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Type @ to mention databases or tables...",
  session,
  onConnectionChange,
  isAgentic = false,
  onAgenticToggle,
}: ChatInputWithMentionsProps) {
  const [schemaCache] = useAtom(schemaCacheAtom);
  const [aiConnections] = useAtom(aiConnectionsAtom);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionStartRef = useRef<number>(-1);

  // Get mention suggestions based on filter
  const getMentionSuggestions = (): MentionItem[] => {
    if (!schemaCache) return [];

    const filter = mentionFilter.toLowerCase();
    const suggestions: MentionItem[] = [];
    const tableOccurrences = new Map<string, string[]>();

    // First pass: count table occurrences across databases
    Object.entries(schemaCache.databases).forEach(([db, data]) => {
      data.tables.forEach((table) => {
        if (!tableOccurrences.has(table)) {
          tableOccurrences.set(table, []);
        }
        tableOccurrences.get(table)!.push(db);
      });
    });

    // Add databases
    Object.entries(schemaCache.databases).forEach(([db, data]) => {
      if (db.toLowerCase().includes(filter)) {
        const tableCount = data.tables.length;
        const hasSchemas = data.schemas && Object.keys(data.schemas).length > 0;
        
        suggestions.push({
          type: "database",
          value: db,
          description: `${tableCount} table${tableCount !== 1 ? 's' : ''}${hasSchemas ? ' with schemas' : ''}`,
        });
      }
    });

    // Add tables (with database prefix)
    Object.entries(schemaCache.databases).forEach(([db, data]) => {
      data.tables.forEach((table) => {
        const fullName = `${db}.${table}`;
        if (
          fullName.toLowerCase().includes(filter) ||
          table.toLowerCase().includes(filter)
        ) {
          const columns = data.schemas?.[table];
          const columnCount = columns ? columns.length : 0;
          const occurrences = tableOccurrences.get(table) || [];
          const isAmbiguous = occurrences.length > 1;
          
          suggestions.push({
            type: "table",
            value: fullName,
            database: db,
            description: isAmbiguous 
              ? `⚠️ in ${db} (also in: ${occurrences.filter(d => d !== db).join(', ')})`
              : `in ${db}${columnCount > 0 ? ` • ${columnCount} columns` : ''}`,
            columnCount,
            isAmbiguous,
          });
        }
      });
    });

    // Sort suggestions: databases first, then tables, ambiguous tables highlighted
    suggestions.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "database" ? -1 : 1;
      }
      if (a.isAmbiguous !== b.isAmbiguous) {
        return a.isAmbiguous ? -1 : 1;
      }
      return a.value.localeCompare(b.value);
    });

    return suggestions.slice(0, 50); // Limit to 50 suggestions
  };

  const suggestions = getMentionSuggestions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset selected index when suggestions change
    setSelectedIndex(0);
  }, [suggestions.length]);

  useEffect(() => {
    // Scroll to selected item
    if (showMentions && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const selectedButton = container.querySelector(
        `button:nth-child(${selectedIndex + 1})`
      ) as HTMLElement;
      if (selectedButton) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const buttonTop = selectedButton.offsetTop;
        const buttonBottom = buttonTop + selectedButton.clientHeight;

        if (buttonTop < containerTop) {
          container.scrollTop = buttonTop;
        } else if (buttonBottom > containerBottom) {
          container.scrollTop = buttonBottom - container.clientHeight;
        }
      }
    }
  }, [selectedIndex, showMentions]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && suggestions.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + suggestions.length) % suggestions.length
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          insertMention(suggestions[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          setShowMentions(false);
          break;
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    onChange(newValue);
    setCursorPosition(cursorPos);

    // Check for @ symbol
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1 && lastAtIndex === textBeforeCursor.length - 1) {
      // Just typed @
      mentionStartRef.current = lastAtIndex;
      setMentionFilter("");
      setShowMentions(true);
    } else if (lastAtIndex !== -1 && mentionStartRef.current !== -1) {
      // Typing after @
      const afterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (afterAt.match(/^[a-zA-Z0-9._]*$/)) {
        setMentionFilter(afterAt);
        setShowMentions(true);
      } else {
        setShowMentions(false);
        mentionStartRef.current = -1;
      }
    } else {
      setShowMentions(false);
      mentionStartRef.current = -1;
    }
  };

  const insertMention = (item: MentionItem) => {
    if (mentionStartRef.current === -1) return;

    const beforeMention = value.slice(0, mentionStartRef.current);
    const afterCursor = value.slice(cursorPosition);
    const newValue = `${beforeMention}@${item.value} ${afterCursor}`;

    onChange(newValue);
    setShowMentions(false);
    mentionStartRef.current = -1;

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + item.value.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleMentionButtonClick = () => {
    const newValue = value + "@";
    onChange(newValue);
    mentionStartRef.current = value.length;
    setMentionFilter("");
    setShowMentions(true);
    setCursorPosition(newValue.length);

    // Focus on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newValue.length, newValue.length);
      }
    }, 0);
  };

  // Auto-select first connection if none selected
  useEffect(() => {
    if (
      aiConnections.length > 0 &&
      !session?.aiConnectionId &&
      onConnectionChange
    ) {
      onConnectionChange(aiConnections[0].id);
    }
  }, [aiConnections.length, session?.aiConnectionId]);

  return (
    <div className="relative">
      {/* Textarea at the top */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="resize-none max-h-[200px] focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={4}
        />

        {/* Mention suggestions dropdown */}
        {showMentions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-full max-w-md bg-popover border rounded-sm p-1 shadow-lg z-50">
            <div ref={scrollContainerRef} className="max-h-64 overflow-y-auto">
              <div className="p-1">
                {suggestions.map((item, index) => (
                  <button
                    key={`${item.type}-${item.value}`}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors ${
                      index === selectedIndex ? "bg-accent" : ""
                    }`}
                    onClick={() => insertMention(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {item.type === "database" ? (
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-500/10">
                        <Database className="w-4 h-4 text-blue-500" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-8 h-8 rounded bg-purple-500/10">
                        <Table className="w-4 h-4 text-purple-500" />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <div className="font-medium">{item.value}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t px-3 py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Search className="w-3 h-3" />
                Type to search • ↑↓ to navigate • Enter to select
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {/* @ button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleMentionButtonClick}
            disabled={disabled}
            type="button"
          >
            <AtSign className="w-4 h-4 mr-1" />
            Mention
          </Button>

          {/* Agentic mode toggle */}
          {onAgenticToggle && (
            <Button
              variant={isAgentic ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => onAgenticToggle(!isAgentic)}
              disabled={disabled}
              type="button"
            >
              <Bot className="w-4 h-4 mr-1" />
              {isAgentic ? "Agentic" : "Direct"}
            </Button>
          )}

          {/* Model selector */}
          <Select
            value={session?.aiConnectionId || aiConnections[0]?.id || ""}
            onValueChange={onConnectionChange}
            disabled={disabled || aiConnections.length === 0}
          >
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="Model">
                {session?.connection?.model ||
                  aiConnections[0]?.model ||
                  "Select"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {aiConnections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{connection.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {connection.model}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Send button */}
        <Button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          size="sm"
          className="h-8 bg-purple-600"
        >
          <Send className="text-white" />
        </Button>
      </div>
    </div>
  );
}
