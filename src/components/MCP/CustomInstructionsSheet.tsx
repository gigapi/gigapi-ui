import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useMCP } from "@/atoms";
import type { CustomInstruction } from "@/types";

interface CustomInstructionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  instruction?: CustomInstruction | null;
}

// Schema for form validation
const instructionSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(2000, "Content must be less than 2000 characters"),
  isActive: z.boolean(),
});

type InstructionFormData = z.infer<typeof instructionSchema>;

export default function CustomInstructionsSheet({
  isOpen,
  onClose,
  instruction,
}: CustomInstructionsSheetProps) {
  const { addCustomInstruction, updateCustomInstruction } = useMCP();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!instruction;

  // React Hook Form setup
  const form = useForm<InstructionFormData>({
    resolver: zodResolver(instructionSchema),
    defaultValues: {
      name: instruction?.name || "",
      content: instruction?.content || "",
      isActive: instruction?.isActive ?? true,
    },
  });

  // Reset form when instruction changes
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        name: instruction?.name || "",
        content: instruction?.content || "",
        isActive: instruction?.isActive ?? true,
      });
    }
  }, [instruction, isOpen, form]);

  // Reset form when instruction changes or dialog opens/closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleSubmit = async (data: InstructionFormData) => {
    setIsSubmitting(true);

    try {
      if (isEditing && instruction) {
        await updateCustomInstruction({
          ...instruction,
          name: data.name.trim(),
          content: data.content.trim(),
          isActive: data.isActive,
        });
      } else {
        await addCustomInstruction({
          name: data.name.trim(),
          content: data.content.trim(),
          isActive: data.isActive,
        });
      }

      form.reset();
      onClose();
    } catch (error: any) {
      toast.error(
        `Failed to ${isEditing ? "update" : "add"} instruction: ${
          error.message
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg px-4">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Custom Instruction" : "Add Custom Instruction"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update your custom instruction that will be sent to the AI model."
              : "Create a custom instruction that will be sent to the AI model in every conversation."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          <div className="space-y-6 py-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-6"
              >
                {/* Name Field */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Writing Style, Code Preferences"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        A short, descriptive name for this instruction.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Content Field */}
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instruction Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Never use the word 'bad' in responses, Always format code with proper indentation, Respond in a casual, friendly tone"
                          className="min-h-[200px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The instruction that will be sent to the AI model. Be
                        specific and clear.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Active Toggle */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          When enabled, this instruction will be included in all
                          AI conversations.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(handleSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isEditing
                ? "Updating..."
                : "Adding..."
              : isEditing
              ? "Update Instruction"
              : "Add Instruction"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
