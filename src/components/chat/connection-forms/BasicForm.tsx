import { Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const connectionSchema = z.object({
  name: z.string().min(1, "Connection name is required"),
  baseUrl: z.string().url("Please enter a valid URL"),
  model: z.string().min(1, "Model is required"),
  headers: z
    .array(
      z.object({
        key: z.string().min(1, "Header key is required"),
        value: z.string().min(1, "Header value is required"),
      })
    )
    .optional(),
  params: z
    .array(
      z.object({
        key: z.string().min(1, "Parameter key is required"),
        value: z.string().min(1, "Parameter value is required"),
      })
    )
    .optional(),
});

export type BasicFormData = z.infer<typeof connectionSchema>;

interface BasicFormProps {
  form: ReturnType<typeof useForm<BasicFormData>>;
}

export function BasicForm({ form }: BasicFormProps) {
  const addHeader = () => {
    const currentHeaders = form.getValues().headers || [];
    form.setValue("headers", [...currentHeaders, { key: "", value: "" }]);
  };

  const removeHeader = (index: number) => {
    const currentHeaders = form.getValues().headers || [];
    form.setValue(
      "headers",
      currentHeaders.filter((_, i) => i !== index)
    );
  };

  const updateHeader = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const currentHeaders = form.getValues().headers || [];
    const updated = [...currentHeaders];
    updated[index][field] = value;
    form.setValue("headers", updated);
  };

  const addParam = () => {
    const currentParams = form.getValues().params || [];
    form.setValue("params", [...currentParams, { key: "", value: "" }]);
  };

  const removeParam = (index: number) => {
    const currentParams = form.getValues().params || [];
    form.setValue(
      "params",
      currentParams.filter((_, i) => i !== index)
    );
  };

  const updateParam = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const currentParams = form.getValues().params || [];
    const updated = [...currentParams];
    updated[index][field] = value;
    form.setValue("params", updated);
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        {/* Compatibility Notice */}
        <div className="rounded-lg bg-primary/5 p-4 border border-primary/10">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> This interface supports AI providers that are compatible with the OpenAI or Ollama API format. 
            Most open-source models and providers (like Groq, Together AI, Perplexity, etc.) follow the OpenAI format.
          </p>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Connection Name</FormLabel>
                <FormControl>
                  <Input placeholder="My AI Connection" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL</FormLabel>
                <FormControl>
                  <Input placeholder="http://localhost:11434" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., gpt-4o-mini-2024-07-18, llama3:latest"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  The specific AI model to use for this connection
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Headers Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Headers</Label>
              <p className="text-sm text-muted-foreground">
                Add custom headers for authentication or configuration
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addHeader}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {(form.watch("headers")?.length || 0) > 0 && (
            <div className="space-y-3">
              {form.watch("headers")?.map((header, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Header name (e.g., Authorization)"
                    value={header.key}
                    onChange={(e) =>
                      updateHeader(index, "key", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Header value (e.g., Bearer token)"
                    value={header.value}
                    onChange={(e) =>
                      updateHeader(index, "value", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHeader(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Parameters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Parameters</Label>
              <p className="text-sm text-muted-foreground">
                Add URL query parameters for your AI provider
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addParam}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {(form.watch("params")?.length || 0) > 0 && (
            <div className="space-y-3">
              {form.watch("params")?.map((param, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Param name (e.g., api_version)"
                    value={param.key}
                    onChange={(e) =>
                      updateParam(index, "key", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Param value (e.g., v1)"
                    value={param.value}
                    onChange={(e) =>
                      updateParam(index, "value", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParam(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Form>
  );
}