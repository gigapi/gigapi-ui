import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  TestTube,
  CheckCircle,
  XCircle,
  Code,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSetAtom } from "jotai";
import { aiConnectionsAtom } from "@/atoms/chat-atoms";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { AIConnection } from "@/types/chat.types";
import OpenAi from "@/assets/openai.svg";
import Anthropic from "@/assets/anthropic.svg";
import Ollama from "@/assets/ollama.svg";
import DeepSeek from "@/assets/deepseek.svg";

interface AIConnectionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Schema for basic form validation
const connectionSchema = z.object({
  name: z.string().min(1, "Connection name is required"),
  baseUrl: z.string().url("Please enter a valid URL"),
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

// Schema for JSON mode validation
const jsonConfigSchema = z.object({
  name: z.string().min(1, "Connection name is required"),
  baseUrl: z.string().url("Please enter a valid URL"),
  headers: z.record(z.string()).optional(),
  params: z.record(z.string()).optional(),
});

type ConnectionFormData = z.infer<typeof connectionSchema>;

// Template definitions
interface AITemplate {
  id: string;
  name: string;
  logo: string;
  baseUrl: string;
  modelsUrl: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  requiredFields: {
    apiKey?: boolean;
    baseUrl?: boolean;
  };
}

const AI_TEMPLATES: AITemplate[] = [
  {
    id: "ollama",
    name: "Ollama",
    logo: Ollama,
    baseUrl: "http://localhost:11434",
    modelsUrl: "http://localhost:11434/v1/models",
    headers: {},
    params: {},
    requiredFields: {},
  },
  {
    id: "openai",
    name: "OpenAI",
    logo: OpenAi,
    baseUrl: "https://api.openai.com/v1",
    modelsUrl: "https://api.openai.com/v1/models",
    headers: {},
    params: {},
    requiredFields: { apiKey: true },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    logo: DeepSeek,
    baseUrl: "https://api.deepseek.com/v1",
    modelsUrl: "https://api.deepseek.com/v1/models",
    headers: {},
    params: {},
    requiredFields: { apiKey: true },
  },

  {
    id: "anthropic",
    name: "Anthropic",
    logo: Anthropic,
    baseUrl: "https://api.anthropic.com/v1",
    modelsUrl: "https://api.anthropic.com/v1/models",
    headers: { "anthropic-version": "2023-06-01" },
    params: {},
    requiredFields: { apiKey: true },
  },
];

// Schema for template form
const templateFormSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url("Please enter a valid URL").optional(),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

export default function AIConnectionSheet({
  isOpen,
  onOpenChange,
}: AIConnectionSheetProps) {
  const setConnections = useSetAtom(aiConnectionsAtom);

  const [mode, setMode] = useState<"templates" | "basic" | "advanced">(
    "templates"
  );
  const [selectedTemplate, setSelectedTemplate] = useState<AITemplate | null>(
    null
  );
  const [jsonConfig, setJsonConfig] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(
    null
  );
  const [testError, setTestError] = useState<string>("");

  // React Hook Form setup
  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: "",
      baseUrl: "",
      headers: [],
      params: [],
    },
  });

  // Auto-select Ollama template on mount
  useEffect(() => {
    if (isOpen && mode === "templates" && !selectedTemplate) {
      const ollamaTemplate = AI_TEMPLATES.find((t) => t.id === "ollama");
      if (ollamaTemplate) {
        handleTemplateSelect(ollamaTemplate);
      }
    }
  }, [isOpen, mode]);

  // Template form setup
  const templateForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      apiKey: "",
      baseUrl: "",
    },
  });

  // Reset form when sheet opens/closes
  const handleOpenChange = (open: boolean) => {
    if (open) {
      // Reset forms when opening
      form.reset({
        name: "",
        baseUrl: "",
        headers: [],
        params: [],
      });
      templateForm.reset({
        apiKey: "",
        baseUrl: "",
      });
      setMode("templates");
      setSelectedTemplate(null);
      setJsonConfig("");
      setTestResult(null);
      setTestError("");
    }
    onOpenChange(open);
  };

  // Handle template selection
  const handleTemplateSelect = (template: AITemplate) => {
    setSelectedTemplate(template);
    templateForm.reset({
      apiKey: "",
      baseUrl: template.baseUrl,
    });
    
    // Auto-add connection for Ollama (no API key needed)
    if (template.id === "ollama") {
      handleAddConnection();
    }
  };

  // Handle adding connection
  const handleAddConnection = () => {
    if (!selectedTemplate) return;
    
    const templateData = templateForm.getValues();
    
    // Check if API key is required but not provided
    if (selectedTemplate.requiredFields.apiKey && !templateData.apiKey?.trim()) {
      toast.error("API key is required for this provider");
      return;
    }
    
    const connectionData = {
      name: selectedTemplate.name,
      baseUrl: templateData.baseUrl || selectedTemplate.baseUrl,
      headers: { ...(selectedTemplate.headers || {}) },
    };
    
    // Add API key to headers if provided
    if (templateData.apiKey?.trim()) {
      if (selectedTemplate.id === "openai" || selectedTemplate.id === "deepseek") {
        connectionData.headers["Authorization"] = `Bearer ${templateData.apiKey}`;
      } else if (selectedTemplate.id === "anthropic") {
        connectionData.headers["x-api-key"] = templateData.apiKey;
      }
    }
    
    // Create new connection
    const newConnection: AIConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: connectionData.name,
      provider: selectedTemplate.id as AIConnection["provider"],
      baseUrl: connectionData.baseUrl,
      modelsUrl: selectedTemplate.modelsUrl,
      headers: connectionData.headers,
      isActive: false,
    };
    
    // Add the connection
    setConnections((prev) => {
      // If this is the first connection, make it active
      if (prev.length === 0) {
        newConnection.isActive = true;
      }
      return [...prev, newConnection];
    });
    
    // Reset and close
    handleOpenChange(false);
    toast.success(`${selectedTemplate.name} connection added successfully!`);
  };

  // Generate JSON config from current form values
  const generateJsonConfig = () => {
    const formData = form.getValues();
    const headersObj = formData.headers?.reduce((acc, header) => {
      if (header.key.trim() && header.value.trim()) {
        acc[header.key.trim()] = header.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);

    const paramsObj = formData.params?.reduce((acc, param) => {
      if (param.key.trim() && param.value.trim()) {
        acc[param.key.trim()] = param.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);

    const config = {
      name: formData.name.trim(),
      baseUrl: formData.baseUrl.trim(),
      ...(Object.keys(headersObj || {}).length > 0 && { headers: headersObj }),
      ...(Object.keys(paramsObj || {}).length > 0 && { params: paramsObj }),
    };

    return JSON.stringify(config, null, 2);
  };

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

  const validateForm = (): {
    isValid: boolean;
    error?: string;
    config?: any;
  } => {
    if (mode === "templates") {
      // Template mode - validate template form
      if (!selectedTemplate) {
        return { isValid: false, error: "Please select a template" };
      }

      const templateData = templateForm.getValues();

      // Check required fields based on template
      if (
        selectedTemplate.requiredFields.apiKey &&
        !templateData.apiKey?.trim()
      ) {
        return {
          isValid: false,
          error: "API key is required for this provider",
        };
      }

      // Build connection config from template
      const config = {
        name: selectedTemplate.name,
        baseUrl: templateData.baseUrl || selectedTemplate.baseUrl,
        headers: selectedTemplate.headers || {},
        params: selectedTemplate.params || {},
      };

      // Add API key to headers if provided
      if (templateData.apiKey?.trim()) {
        if (selectedTemplate.id === "openai") {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${templateData.apiKey}`,
          };
        } else if (selectedTemplate.id === "anthropic") {
          config.headers = {
            ...config.headers,
            "x-api-key": templateData.apiKey,
          };
        }
      }

      return { isValid: true, config };
    } else if (mode === "advanced") {
      // Advanced mode - validate JSON
      if (!jsonConfig.trim())
        return { isValid: false, error: "JSON configuration is required" };

      try {
        const parsed = jsonConfigSchema.parse(JSON.parse(jsonConfig));
        return { isValid: true, config: parsed };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return { isValid: false, error: error.errors[0].message };
        }
        return { isValid: false, error: "Invalid JSON format" };
      }
    } else {
      // Basic mode - use React Hook Form validation
      const result = connectionSchema.safeParse(form.getValues());
      if (!result.success) {
        return { isValid: false, error: result.error.errors[0].message };
      }
      return { isValid: true };
    }
  };

  const handleTestConnection = async () => {
    const validation = validateForm();
    if (!validation.isValid) {
      toast.error(validation.error!);
      return;
    }

    setIsTestingConnection(true);
    setTestResult(null);
    setTestError("");

    try {
      let connectionData;

      if (mode === "templates" || mode === "advanced") {
        // Use validated config directly (from template or JSON)
        connectionData = validation.config!;
      } else {
        // Get form data and convert to connection data
        const formData = form.getValues();
        const headersObj = formData.headers?.reduce((acc, header) => {
          if (header.key.trim() && header.value.trim()) {
            acc[header.key.trim()] = header.value.trim();
          }
          return acc;
        }, {} as Record<string, string>);

        const paramsObj = formData.params?.reduce((acc, param) => {
          if (param.key.trim() && param.value.trim()) {
            acc[param.key.trim()] = param.value.trim();
          }
          return acc;
        }, {} as Record<string, string>);

        connectionData = {
          name: formData.name.trim(),
          baseUrl: formData.baseUrl.trim(),
          headers:
            Object.keys(headersObj || {}).length > 0 ? headersObj : undefined,
          params:
            Object.keys(paramsObj || {}).length > 0 ? paramsObj : undefined,
        };
      }

      // Test with a real message
      const testMessage =
        "Hello, can you respond with just 'OK' to confirm the connection works?";

      // Build headers
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(connectionData.headers || {}),
      };

      // Build endpoint - try to detect the correct endpoint based on base URL
      let testEndpoint = connectionData.baseUrl;

      // If baseUrl doesn't already include the endpoint, add the appropriate one
      if (
        !testEndpoint.includes("/chat") &&
        !testEndpoint.includes("/api/chat") &&
        !testEndpoint.includes("/v1/chat")
      ) {
        // For OpenAI-compatible APIs
        if (
          testEndpoint.includes("openai.com") ||
          testEndpoint.includes("api.openai.com")
        ) {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "chat/completions"
            : testEndpoint + "/chat/completions";
        }
        // For Ollama
        else if (
          testEndpoint.includes("localhost") ||
          testEndpoint.includes("127.0.0.1") ||
          testEndpoint.includes("ollama")
        ) {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "api/chat"
            : testEndpoint + "/api/chat";
        }
        // Default to OpenAI-compatible format for other providers
        else {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "chat/completions"
            : testEndpoint + "/chat/completions";
        }
      }

      // Add query parameters if provided
      if (
        connectionData.params &&
        Object.keys(connectionData.params).length > 0
      ) {
        const url = new URL(testEndpoint);
        Object.entries(connectionData.params).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
        testEndpoint = url.toString();
      }

      const requestBody = {
        model: "test-model", // Use a placeholder model for testing
        messages: [
          {
            role: "user",
            content: testMessage,
          },
        ],
        stream: false,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(testEndpoint, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();

      // Parse response content from different AI providers
      let responseContent: string | null = null;

      // Try OpenAI format first (choices[0].message.content)
      if (data.choices?.[0]?.message?.content) {
        responseContent = data.choices[0].message.content;
      }
      // Try Ollama format (message.content)
      else if (data.message?.content) {
        responseContent = data.message.content;
      }
      // Try Anthropic format (content[0].text)
      else if (data.content?.[0]?.text) {
        responseContent = data.content[0].text;
      }
      // Try generic content field
      else if (data.content) {
        responseContent = data.content;
      }

      if (!responseContent) {
        console.error("Unexpected response format:", data);
        throw new Error(
          "Invalid response format - AI provider returned unexpected structure"
        );
      }

      // Verify the AI actually responded (not just an empty response)
      if (!responseContent.trim()) {
        throw new Error("AI provider returned empty response");
      }

      setTestResult("success");
    } catch (error: any) {
      setTestResult("error");
      let errorMessage = error.message || "Connection test failed";

      if (error.name === "AbortError") {
        errorMessage = "Connection timeout - request took too long";
      } else if (error.message.includes("fetch")) {
        errorMessage = "Network error - cannot reach the AI provider";
      }

      setTestError(errorMessage);
      toast.error(`Connection test failed: ${errorMessage}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveConnection = async () => {
    let testEndpoint = ""; // Declare testEndpoint at the beginning of the function
    if (testResult !== "success") {
      toast.error("Please test the connection first");
      return;
    }

    try {
      const validation = validateForm();
      if (!validation.isValid) {
        toast.error(validation.error!);
        return;
      }

      let connectionData;

      if (mode === "templates" || mode === "advanced") {
        // Use validated config directly (from template or JSON)
        connectionData = validation.config!;
      } else {
        // Get form data and convert to connection data
        const formData = form.getValues();
        const headersObj = formData.headers?.reduce((acc, header) => {
          if (header.key.trim() && header.value.trim()) {
            acc[header.key.trim()] = header.value.trim();
          }
          return acc;
        }, {} as Record<string, string>);

        const paramsObj = formData.params?.reduce((acc, param) => {
          if (param.key.trim() && param.value.trim()) {
            acc[param.key.trim()] = param.value.trim();
          }
          return acc;
        }, {} as Record<string, string>);

        connectionData = {
          name: formData.name.trim(),
          baseUrl: formData.baseUrl.trim(),
          headers:
            Object.keys(headersObj || {}).length > 0 ? headersObj : undefined,
          params:
            Object.keys(paramsObj || {}).length > 0 ? paramsObj : undefined,
        };
      }

      // Build endpoint - same logic as in test function
      testEndpoint = connectionData.baseUrl;
      if (
        !testEndpoint.includes("/chat") &&
        !testEndpoint.includes("/api/chat") &&
        !testEndpoint.includes("/v1/chat")
      ) {
        // For OpenAI-compatible APIs
        if (
          testEndpoint.includes("openai.com") ||
          testEndpoint.includes("api.openai.com")
        ) {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "chat/completions"
            : testEndpoint + "/chat/completions";
        }
        // For Ollama
        else if (
          testEndpoint.includes("localhost") ||
          testEndpoint.includes("127.0.0.1") ||
          testEndpoint.includes("ollama")
        ) {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "api/chat"
            : testEndpoint + "/api/chat";
        }
        // Default to OpenAI-compatible format for other providers
        else {
          testEndpoint = testEndpoint.endsWith("/")
            ? testEndpoint + "chat/completions"
            : testEndpoint + "/chat/completions";
        }
      }

      // Determine provider from base URL or template
      let provider: AIConnection["provider"] = "custom";
      if (selectedTemplate) {
        provider = selectedTemplate.id as AIConnection["provider"];
      } else if (connectionData.baseUrl.includes("openai.com")) {
        provider = "openai";
      } else if (connectionData.baseUrl.includes("anthropic.com")) {
        provider = "anthropic";
      } else if (
        connectionData.baseUrl.includes("localhost") ||
        connectionData.baseUrl.includes("ollama")
      ) {
        provider = "ollama";
      }

      // Create new connection object
      const newConnection: AIConnection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: connectionData.name,
        provider,
        baseUrl: connectionData.baseUrl,
        modelsUrl: "", // Will be set based on provider
        headers: connectionData.headers || {},
        isActive: false,
      };
      
      // Set modelsUrl based on provider
      if (provider === "openai") {
        newConnection.modelsUrl = "https://api.openai.com/v1/models";
      } else if (provider === "anthropic") {
        newConnection.modelsUrl = "https://api.anthropic.com/v1/models";
      } else if (provider === "deepseek") {
        newConnection.modelsUrl = "https://api.deepseek.com/v1/models";
      } else if (provider === "ollama") {
        newConnection.modelsUrl = connectionData.baseUrl.endsWith("/")
          ? connectionData.baseUrl + "v1/models"
          : connectionData.baseUrl + "/v1/models";
      }

      // Add the connection
      setConnections((prev) => {
        // If this is the first connection, make it active
        if (prev.length === 0) {
          newConnection.isActive = true;
        }
        return [...prev, newConnection];
      });

      // Reset forms after successful save
      form.reset();
      templateForm.reset();
      setMode("templates");
      setSelectedTemplate(null);
      setJsonConfig("");
      setTestResult(null);
      setTestError("");

      handleOpenChange(false);
      toast.success("AI connection added successfully!");
    } catch (error: any) {
      toast.error(`Failed to add connection: ${error.message}`);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-xl px-4">
        <SheetHeader>
          <SheetTitle>Add AI Connection</SheetTitle>
          <SheetDescription>
            Configure a connection to any AI provider. Choose from templates or
            create a custom connection.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          <div className="space-y-6 py-4">
            {/* Mode Selection */}
            <Tabs
              value={mode}
              onValueChange={(value) =>
                setMode(value as "templates" | "basic" | "advanced")
              }
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="basic">Basic Mode</TabsTrigger>
                <TabsTrigger value="advanced">Advanced Mode</TabsTrigger>
              </TabsList>

              <TabsContent value="templates" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Providers</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select a template to quickly set up your AI connection
                    </p>
                  </div>

                  {/* Template Selection Grid */}
                  <div className="grid grid-cols-5 gap-3">
                    {AI_TEMPLATES.map((template) => {
                      return (
                        <div
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                            selectedTemplate?.id === template.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={template.logo}
                              className="w-8 h-8 flex-shrink-0 mt-1 dark:invert"
                            />
                          </div>
                        </div>
                      );
                    })}
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

                      <Form {...templateForm}>
                        <div className="space-y-4">
                          {selectedTemplate.requiredFields.apiKey && (
                            <FormField
                              control={templateForm.control}
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
                                    Your API key will be stored securely and
                                    used for authentication
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          <Button
                            type="button"
                            variant="default"
                            onClick={handleAddConnection}
                            disabled={
                              selectedTemplate.requiredFields.apiKey &&
                              !templateForm.watch("apiKey")?.trim()
                            }
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Connection
                          </Button>

                          {selectedTemplate.requiredFields.baseUrl && (
                            <FormField
                              control={templateForm.control}
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
              </TabsContent>

              <TabsContent value="basic" className="space-y-6 mt-6">
                <Form {...form}>
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
                            <Input
                              placeholder="http://localhost:11434"
                              {...field}
                            />
                          </FormControl>
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
                        <Label className="text-base font-medium">
                          Parameters
                        </Label>
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
                </Form>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">
                        JSON Configuration
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Configure your AI connection using JSON format
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setJsonConfig(generateJsonConfig())}
                        className="flex items-center gap-2"
                      >
                        <Code className="h-4 w-4" />
                        Generate from Basic
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      value={jsonConfig}
                      onChange={(e) => setJsonConfig(e.target.value)}
                      placeholder={`{
  "name": "My AI Connection",
  "baseUrl": "http://localhost:11434",
  "model": "llama3:latest",
  "headers": {
    "Authorization": "Bearer your-token-here"
  },
  "params": {
    "api_version": "v1"
  }
}`}
                      className="min-h-[300px] max-w-[520px] m-auto overflow-y-auto font-mono text-sm"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Test Connection - Only show for Basic and Advanced modes */}
            {mode !== "templates" && (
              <div className="space-y-4">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="w-full"
                  variant="outline"
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
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
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
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {mode !== "templates" && (
            <Button
              onClick={handleSaveConnection}
              disabled={testResult !== "success"}
            >
              Add Connection
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
