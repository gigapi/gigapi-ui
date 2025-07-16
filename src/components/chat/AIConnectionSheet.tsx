import { useState } from "react";
import { TestTube, CheckCircle, XCircle } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AIConnection } from "@/types/chat.types";
import { TemplateForm } from "./connection-forms/TemplateForm";
import { BasicForm } from "./connection-forms/BasicForm";
import { AdvancedForm } from "./connection-forms/AdvancedForm";
import { useAIConnectionTest } from "@/hooks/useAIConnection";

interface AIConnectionSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

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

// Schema for JSON mode validation
const jsonConfigSchema = z.object({
  name: z.string().min(1, "Connection name is required"),
  baseUrl: z.string().url("Please enter a valid URL"),
  model: z.string().min(1, "Model is required"),
  headers: z.record(z.string()).optional(),
  params: z.record(z.string()).optional(),
});

type ConnectionFormData = z.infer<typeof connectionSchema>;

export default function AIConnectionSheet({
  isOpen,
  onOpenChange,
}: AIConnectionSheetProps) {
  const setConnections = useSetAtom(aiConnectionsAtom);
  const { testConnection, isTestingConnection, testResult, testError } =
    useAIConnectionTest();

  const [mode, setMode] = useState<"templates" | "basic" | "advanced">(
    "templates"
  );
  const [jsonConfig, setJsonConfig] = useState("");

  // React Hook Form setup
  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: "",
      baseUrl: "",
      model: "",
      headers: [],
      params: [],
    },
  });

  // Reset form when sheet opens/closes
  const handleOpenChange = (open: boolean) => {
    if (open) {
      // Reset forms when opening
      form.reset({
        name: "",
        baseUrl: "",
        model: "",
        headers: [],
        params: [],
      });
      setMode("templates");
      setJsonConfig("");
    }
    onOpenChange(open);
  };

  // Handle adding connection from template form
  const handleAddConnectionFromTemplate = (connection: AIConnection) => {
    setConnections((prev) => {
      // If this is the first connection, make it active
      if (prev.length === 0) {
        connection.isActive = true;
      }
      return [...prev, connection];
    });

    handleOpenChange(false);
    toast.success(`${connection.name} added successfully!`);
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
      model: formData.model.trim(),
      ...(Object.keys(headersObj || {}).length > 0 && { headers: headersObj }),
      ...(Object.keys(paramsObj || {}).length > 0 && { params: paramsObj }),
    };

    return JSON.stringify(config, null, 2);
  };

  const validateForm = (): {
    isValid: boolean;
    error?: string;
    config?: any;
  } => {
    if (mode === "advanced") {
      // Advanced mode - validate JSON
      if (!jsonConfig.trim())
        return { isValid: false, error: "JSON configuration is required" };

      try {
        const parsed = jsonConfigSchema.parse(JSON.parse(jsonConfig));
        return { isValid: true, config: parsed };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return { isValid: false, error: error.issues[0].message };
        }
        return { isValid: false, error: "Invalid JSON format" };
      }
    } else {
      // Basic mode - use React Hook Form validation
      const result = connectionSchema.safeParse(form.getValues());
      if (!result.success) {
        return { isValid: false, error: result.error.issues[0].message };
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

    let connectionData;

    if (mode === "advanced") {
      // Use validated config directly from JSON
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
        model: formData.model.trim(),
        headers: headersObj || {},
        params: paramsObj,
      };
    }

    await testConnection({
      baseUrl: connectionData.baseUrl,
      model: connectionData.model,
      headers: connectionData.headers || {},
      params: connectionData.params,
    });
  };

  const handleSaveConnection = async () => {
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

      if (mode === "advanced") {
        // Use validated config directly from JSON
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
          model: formData.model.trim(),
          headers: headersObj || {},
          params: paramsObj,
        };
      }

      // Determine provider from base URL
      let provider: AIConnection["provider"] = "custom";
      if (connectionData.baseUrl.includes("openai.com")) {
        provider = "openai";
      } else if (
        connectionData.baseUrl.includes("localhost") ||
        connectionData.baseUrl.includes("ollama")
      ) {
        provider = "ollama";
      } else if (connectionData.baseUrl.includes("deepseek.com")) {
        provider = "deepseek";
      }

      // Create new connection object
      const newConnection: AIConnection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: connectionData.name,
        provider,
        baseUrl: connectionData.baseUrl,
        model: connectionData.model,
        headers: connectionData.headers || {},
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

      // Reset forms after successful save
      form.reset();
      setMode("templates");
      setJsonConfig("");

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
                <TemplateForm
                  onAddConnection={handleAddConnectionFromTemplate}
                />
              </TabsContent>

              <TabsContent value="basic" className="space-y-6 mt-6">
                <BasicForm form={form} />
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6 mt-6">
                <AdvancedForm
                  jsonConfig={jsonConfig}
                  setJsonConfig={setJsonConfig}
                  generateJsonConfig={generateJsonConfig}
                />
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
