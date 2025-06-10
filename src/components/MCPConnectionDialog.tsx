import { useState, useEffect } from "react";
import { useMCP } from "@/contexts/MCPContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TestTube, CheckCircle, XCircle, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import type { AIProvider, AIModel } from "@/types";

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDER_INFO = {
  ollama: {
    name: "Ollama",
    description: "Local AI models running on your machine",
    defaultUrl: "http://localhost:11434",
    requiresApiKey: false,
  },
  openai: {
    name: "OpenAI",
    description: "OpenAI GPT models via API",
    defaultUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude models via Anthropic API",
    defaultUrl: "https://api.anthropic.com/v1",
    requiresApiKey: true,
  },
  custom: {
    name: "Custom",
    description: "Custom AI provider with your own configuration",
    defaultUrl: "",
    requiresApiKey: false,
  },
};

export default function ConnectionDialog({ isOpen, onClose }: ConnectionDialogProps) {
  const { addConnection, fetchModels } = useMCP();
  
  const [provider, setProvider] = useState<AIProvider>("ollama");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [attemptedUrls, setAttemptedUrls] = useState<Set<string>>(new Set());

  const providerInfo = PROVIDER_INFO[provider];

  // Reset form when provider changes
  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    setName(`My ${PROVIDER_INFO[newProvider].name} Connection`);
    setBaseUrl(PROVIDER_INFO[newProvider].defaultUrl);
    setModel("");
    setAvailableModels([]);
    setTestResult(null);
    setAttemptedUrls(new Set());
  };

  // Fetch models from Ollama when URL changes
  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      toast.error("Please enter a base URL first");
      return;
    }

    const urlToTry = baseUrl.trim();
    
    setIsLoadingModels(true);
    try {
      const models = await fetchModels(urlToTry);
      setAvailableModels(models);
      setAttemptedUrls(prev => new Set(prev).add(urlToTry));
      if (models.length > 0) {
        setModel(models[0].id);
        toast.success(`Found ${models.length} available models`);
      } else {
        toast.warning("No models found on this Ollama instance");
      }
    } catch (error: any) {
      toast.error(`Failed to fetch models: ${error.message}`);
      setAvailableModels([]);
      setAttemptedUrls(prev => new Set(prev).add(urlToTry));
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Auto-fetch models when base URL changes and is valid
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const urlToCheck = baseUrl.trim();
      if (
        urlToCheck && 
        urlToCheck !== PROVIDER_INFO[provider].defaultUrl && 
        !isLoadingModels &&
        !attemptedUrls.has(urlToCheck)
      ) {
        handleFetchModels();
      }
    }, 1000); // Debounce URL changes

    return () => clearTimeout(timeoutId);
  }, [baseUrl, provider]); // Removed isLoadingModels and attemptedUrls from dependencies

  // Initialize form when dialog opens
  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      handleProviderChange("ollama");
      setAttemptedUrls(new Set());
    } else {
      onClose();
    }
  };

  const handleTestConnection = async () => {
    if (!name.trim()) {
      toast.error("Please enter a connection name");
      return;
    }


    if (!baseUrl.trim()) {
      toast.error("Please enter a base URL");
      return;
    }

    if (!model.trim()) {
      toast.error("Please select a model");
      return;
    }

    setIsTestingConnection(true);
    setTestResult(null);

    try {
      // Create a temporary connection for testing
      const testConnectionData = {
        provider,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
      };

      // Test the connection using the MCP context
      await addConnection(testConnectionData);
      setTestResult("success");
      toast.success("Connection test successful!");
    } catch (error: any) {
      setTestResult("error");
      toast.error(`Connection test failed: ${error.message}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveConnection = async () => {
    if (testResult !== "success") {
      toast.error("Please test the connection first");
      return;
    }

    // Connection was already added during test, just close the dialog
    onClose();
    toast.success("AI connection added successfully!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add AI Connection</DialogTitle>
          <DialogDescription>
            Configure a connection to an AI provider for the copilot feature.
          </DialogDescription>
        </DialogHeader>


        <div className="grid gap-4 py-4">
          {/* Provider Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="provider" className="text-right text-sm">
              Provider
            </Label>
            <div className="col-span-3">
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{info.name}</span>
                        {key === "ollama" && (
                          <Badge variant="secondary" className="text-xs">Local</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {providerInfo.description}
              </p>
            </div>
          </div>

          {/* Connection Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right text-sm">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="My AI Connection"
            />
          </div>


          {/* Base URL */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="baseUrl" className="text-right text-sm">
              Base URL
            </Label>
            <div className="col-span-3 flex gap-2">
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="flex-1"
                placeholder={providerInfo.defaultUrl}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Clear the attempted URL so it can be retried
                  setAttemptedUrls(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(baseUrl.trim());
                    return newSet;
                  });
                  handleFetchModels();
                }}
                disabled={isLoadingModels || !baseUrl.trim()}
                className="px-3"
              >
                {isLoadingModels ? (
                  <Loader className="h-4 w-4" />
                ) : (
                  <FolderSearch className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model" className="text-right text-sm">
              Model
            </Label>
            <div className="col-span-3">
              <Select value={model} onValueChange={setModel} disabled={availableModels.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={availableModels.length === 0 ? "Fetch models first" : "Select a model"} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((modelInfo: AIModel) => (
                    <SelectItem key={modelInfo.id} value={modelInfo.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{modelInfo.name}</span>
                        {modelInfo.size && (
                          <Badge variant="secondary" className="text-xs ml-2">
                            {formatBytes(modelInfo.size)}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableModels.length === 0 && baseUrl && (
                <p className="text-xs text-muted-foreground mt-1">
                  Click the refresh button to fetch available models
                </p>
              )}
            </div>
          </div>

          {/* Test Connection Button */}
          <div className="grid grid-cols-4 items-center gap-4">
            <div></div>
            <div className="col-span-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="w-full"
              >
                {isTestingConnection ? (
                  <>
                    <Loader className="mr-2 h-4 w-4" />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>

              {/* Test Result */}
              {testResult && (
                <div className={`flex items-center gap-2 mt-2 text-sm ${
                  testResult === "success" ? "text-green-600" : "text-red-600"
                }`}>
                  {testResult === "success" ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult === "success" 
                    ? "Connection successful!" 
                    : "Connection failed"
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSaveConnection}
            disabled={testResult !== "success"}
          >
            Add Connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}