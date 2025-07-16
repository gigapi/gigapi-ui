import { useState, useEffect } from "react";
import { CheckCircle, TestTube, Plus, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { AITemplate } from "@/lib/ai-providers/templates";
import { AI_TEMPLATES } from "@/lib/ai-providers/templates";
import { useAIConnectionTest } from "@/hooks/useAIConnection";

const templateFormSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url("Please enter a valid URL").optional(),
  model: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface TemplateFormProps {
  onAddConnection: (connection: any) => void;
}

export function TemplateForm({ onAddConnection }: TemplateFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<AITemplate | null>(
    null
  );
  const { testConnection, isTestingConnection, testResult, testError } =
    useAIConnectionTest();

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      apiKey: "",
      baseUrl: "",
      model: "",
    },
  });

  // Auto-select Ollama on mount
  useEffect(() => {
    const ollamaTemplate = AI_TEMPLATES.find((t) => t.id === "ollama");
    if (ollamaTemplate) {
      handleTemplateSelect(ollamaTemplate);
    }
  }, []);

  const handleTemplateSelect = (template: AITemplate) => {
    setSelectedTemplate(template);
    form.reset({
      apiKey: "",
      baseUrl: template.baseUrl,
      model: template.defaultModel || "",
    });
  };

  const handleTestConnection = async () => {
    if (!selectedTemplate) return;

    const formData = form.getValues();

    // Validate required fields
    if (selectedTemplate.requiredFields.apiKey && !formData.apiKey?.trim()) {
      form.setError("apiKey", {
        message: "API key is required for this provider",
      });
      return;
    }

    if (selectedTemplate.requiredFields.model && !formData.model?.trim()) {
      form.setError("model", {
        message: "Model is required for this provider",
      });
      return;
    }

    const config = {
      template: selectedTemplate,
      baseUrl: formData.baseUrl || selectedTemplate.baseUrl,
      model: formData.model || selectedTemplate.defaultModel || "",
      headers: selectedTemplate.headers || {},
      apiKey: formData.apiKey,
    };

    await testConnection(config);
  };

  const handleAddConnection = () => {
    if (!selectedTemplate || testResult !== "success") return;

    const formData = form.getValues();

    const connection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: `${selectedTemplate.name} - ${
        formData.model || selectedTemplate.defaultModel
      }`,
      provider: selectedTemplate.id,
      baseUrl: formData.baseUrl || selectedTemplate.baseUrl,
      model: formData.model || selectedTemplate.defaultModel || "",
      headers: { ...(selectedTemplate.headers || {}) },
      isActive: false,
    };

    // Add API key to headers (except for Gemini which uses URL parameter)
    if (formData.apiKey?.trim() && selectedTemplate.apiConfig.authHeader) {
      const authHeader = selectedTemplate.apiConfig.authHeader;
      const authPrefix = selectedTemplate.apiConfig.authPrefix || "";
      connection.headers[authHeader] = authPrefix + formData.apiKey;
    }

    onAddConnection(connection);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-medium">Providers</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Select a template to quickly set up your AI connection
        </p>
      </div>

      {/* Template Selection Grid */}
      <div className="grid grid-cols-3 gap-3">
        {AI_TEMPLATES.map((template) => (
          <div
            key={template.id}
            onClick={() => handleTemplateSelect(template)}
            className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
              selectedTemplate?.id === template.id
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <img
                src={template.logo}
                alt={template.name}
                className="w-10 h-10 object-contain dark:invert"
              />
              <span className="text-xs text-center font-medium">
                {template.name}
              </span>
            </div>
            {selectedTemplate?.id === template.id && (
              <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />
            )}
          </div>
        ))}
      </div>

      {/* Template Configuration */}
      {selectedTemplate && (
        <div className="space-y-4 pt-4 border-t">
          <div>
            <Label className="text-base font-medium">
              Configure {selectedTemplate.name}
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the required information for your connection
            </p>
          </div>

          <Form {...form}>
            <div className="space-y-4">
              {selectedTemplate.requiredFields.apiKey && (
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your API key"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Your API key will be stored securely and used for
                        authentication
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedTemplate.requiredFields.model && (
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            selectedTemplate.defaultModel || "Enter model name"
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The AI model to use (e.g., gpt-4-turbo-preview,
                        llama3:latest)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={
                    isTestingConnection ||
                    (selectedTemplate.requiredFields.apiKey &&
                      !form.watch("apiKey")?.trim()) ||
                    (selectedTemplate.requiredFields.model &&
                      !form.watch("model")?.trim())
                  }
                  className="w-full"
                >
                  {isTestingConnection ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>

                {testResult && (
                  <div
                    className={`flex items-center gap-2 p-3 rounded-md ${
                      testResult === "success"
                        ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                        : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                    }`}
                  >
                    {testResult === "success" ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">
                      {testResult === "success"
                        ? "Connection successful!"
                        : "Connection failed"}
                    </span>
                    {testResult === "error" && testError && (
                      <p className="text-sm mt-1">{testError}</p>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  variant="default"
                  onClick={handleAddConnection}
                  disabled={
                    testResult !== "success" ||
                    (selectedTemplate.requiredFields.apiKey &&
                      !form.watch("apiKey")?.trim()) ||
                    (selectedTemplate.requiredFields.model &&
                      !form.watch("model")?.trim())
                  }
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Connection
                </Button>
              </div>

              {selectedTemplate.requiredFields.baseUrl && (
                <FormField
                  control={form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={selectedTemplate.baseUrl}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Custom endpoint URL for your AI provider
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </Form>
        </div>
      )}
    </div>
  );
}
