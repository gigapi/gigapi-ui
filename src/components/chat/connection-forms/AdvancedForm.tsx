import { Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AdvancedFormProps {
  jsonConfig: string;
  setJsonConfig: (value: string) => void;
  generateJsonConfig?: () => string;
}

export function AdvancedForm({ 
  jsonConfig, 
  setJsonConfig, 
  generateJsonConfig 
}: AdvancedFormProps) {
  return (
    <div className="space-y-4">
      {/* Compatibility Notice */}
      <div className="rounded-lg bg-primary/5 p-4 border border-primary/10">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> This interface supports AI providers that are compatible with the OpenAI or Ollama API format. 
          Most open-source models and providers (like Groq, Together AI, Perplexity, etc.) follow the OpenAI format.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">JSON Configuration</Label>
          <p className="text-sm text-muted-foreground">
            Configure your AI connection using JSON format
          </p>
        </div>
        {generateJsonConfig && (
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
        )}
      </div>

      <div className="space-y-2">
        <Textarea
          value={jsonConfig}
          onChange={(e) => setJsonConfig(e.target.value)}
          placeholder={`{
  "name": "GPT-4",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o-mini-2024-07-18",
  "headers": {
    "Authorization": "Bearer your-api-key-here"
  }
}`}
          className="min-h-[300px] font-mono text-sm max-w-lg"
        />
      </div>
    </div>
  );
}