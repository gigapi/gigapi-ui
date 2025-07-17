import { useState, useCallback } from "react";
import { useAtom } from "jotai";
import { chatSessionsAtom } from "@/atoms/chat-atoms";
import { apiUrlAtom } from "@/atoms/connection-atoms";
import { toast } from "sonner";
import { AutoExecutionEngine } from "@/lib/auto-execution";
import { ResultFeedbackManager } from "@/lib/auto-execution/result-feedback";
import ArtifactRenderer from "./ArtifactRenderer";
import ProposalArtifact from "./ProposalArtifact";
import type {
  ChatArtifact,
  ChatSession,
  ChatMessage,
  ProposalArtifact as ProposalArtifactType,
} from "@/types/chat.types";
import type { ExecutionContext } from "@/lib/auto-execution/types";

interface ArtifactRendererWrapperProps {
  artifact: ChatArtifact;
  session: ChatSession;
}

export default function ArtifactRendererWrapper({
  artifact,
  session,
}: ArtifactRendererWrapperProps) {
  const [chatSessions, setChatSessions] = useAtom(chatSessionsAtom);
  const [apiUrl] = useAtom(apiUrlAtom);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleProposalApproval = useCallback(
    async (proposalId: string) => {
      try {
        setIsExecuting(true);

        // Find the proposal artifact in the session
        const currentSession = chatSessions[session.id];
        if (!currentSession) {
          toast.error("Session not found");
          return;
        }

        const proposal = artifact.data as ProposalArtifactType;

        // Update proposal as approved and executing
        const updatedMessages = currentSession.messages.map((message) => {
          if (message.metadata?.artifacts) {
            const updatedArtifacts = message.metadata.artifacts.map((art) => {
              if (art.id === proposalId && art.type === "proposal") {
                return {
                  ...art,
                  data: {
                    ...proposal,
                    approved: true,
                    auto_execute: true,
                    execution_status: "executing" as const,
                  },
                };
              }
              return art;
            });
            return {
              ...message,
              metadata: {
                ...message.metadata,
                artifacts: updatedArtifacts,
              },
            };
          }
          return message;
        });

        // Update the session with approved status
        setChatSessions({
          ...chatSessions,
          [session.id]: {
            ...currentSession,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          },
        });

        // Initialize auto-execution engine
        const autoExecutionEngine = new AutoExecutionEngine(apiUrl);
        const resultFeedbackManager = new ResultFeedbackManager();

        // Create execution context
        const executionContext: ExecutionContext = {
          session_id: session.id,
          database: proposal.database,
          time_range: {
            type: "relative",
            from: "now-1h",
            to: "now",
          },
          chat_history: currentSession.messages,
        };

        // Execute the query
        const executionResult = await autoExecutionEngine.executeProposal(
          proposal,
          executionContext
        );

        // Generate feedback
        const feedback = resultFeedbackManager.generateFeedback(
          proposalId,
          executionResult,
          proposal
        );

        // Create result artifact based on proposal chart type
        const artifactType = proposal.chart_type ? "chart" : "query";
        const resultArtifact: ChatArtifact = {
          id: `artifact_${Date.now()}`,
          type: artifactType,
          title: proposal.title,
          data: proposal.chart_type
            ? {
                // Chart artifact structure
                query: proposal.query,
                database: proposal.database,
                type: proposal.chart_type,
                chartType: proposal.chart_type, // Also set chartType for compatibility
                fieldMapping: {
                  xField: proposal.x_axis,
                  yField:
                    proposal.y_axes && proposal.y_axes.length > 0
                      ? proposal.y_axes[0]
                      : undefined,
                  colorField:
                    proposal.y_axes && proposal.y_axes.length > 1
                      ? proposal.y_axes[1]
                      : undefined,
                },
                fieldConfig: {
                  defaults: {
                    unit: "short",
                    decimals: 2,
                  },
                },
                options: {
                  legend: {
                    showLegend: true,
                    placement: "bottom",
                  },
                },
                metadata: {
                  execution_result: executionResult,
                  feedback: feedback,
                  title: proposal.title,
                },
              }
            : {
                // Query artifact structure
                query: proposal.query,
                database: proposal.database,
                metadata: {
                  execution_result: executionResult,
                  feedback: feedback,
                  title: proposal.title,
                },
              },
        };

        // Update proposal with execution results
        const finalMessages = updatedMessages.map((message) => {
          if (message.metadata?.artifacts) {
            const finalArtifacts = message.metadata.artifacts.map((art) => {
              if (art.id === proposalId && art.type === "proposal") {
                return {
                  ...art,
                  data: {
                    ...proposal,
                    approved: true,
                    auto_execute: true,
                    execution_status: executionResult.success
                      ? ("completed" as const)
                      : ("failed" as const),
                    execution_error: executionResult.error,
                    execution_time: executionResult.execution_time,
                    execution_timestamp: executionResult.timestamp,
                    results: executionResult.data || [],
                    result_summary: feedback.summary,
                  },
                };
              }
              return art;
            });
            return {
              ...message,
              metadata: {
                ...message.metadata,
                artifacts: finalArtifacts,
              },
            };
          }
          return message;
        });

        // Create AI feedback message
        const feedbackMessage = {
          id: `msg_${Date.now()}_feedback`,
          role: "assistant" as const,
          content: `Query executed successfully! Here's what I found:\n\n${
            feedback.summary
          }\n\n${
            feedback.insights.length > 0
              ? `**Key Insights:**\n${feedback.insights
                  .map((i) => `• ${i}`)
                  .join("\n")}\n\n`
              : ""
          }${
            feedback.recommendations.length > 0
              ? `**Recommendations:**\n${feedback.recommendations
                  .map((r) => `• ${r}`)
                  .join("\n")}\n\n`
              : ""
          }${
            feedback.follow_up_questions.length > 0
              ? `**Would you like me to:**\n${feedback.follow_up_questions
                  .map((q) => `• ${q}`)
                  .join("\n")}`
              : ""
          }`,
          timestamp: new Date().toISOString(),
          metadata: {
            artifacts: [resultArtifact],
            proposalId: proposalId,
            executionResult: executionResult,
            feedback: feedback,
          },
        };

        // Add the feedback message to the session
        setChatSessions({
          ...chatSessions,
          [session.id]: {
            ...currentSession,
            messages: [...finalMessages, feedbackMessage],
            updatedAt: new Date().toISOString(),
          },
        });

        if (executionResult.success) {
          toast.success(
            `Query executed successfully! Found ${
              executionResult.row_count || 0
            } rows.`
          );
        } else {
          toast.error(`Query execution failed: ${executionResult.error}`);
        }
      } catch (error) {
        console.error("Error in auto-execution:", error);
        toast.error("Failed to execute query automatically");
      } finally {
        setIsExecuting(false);
      }
    },
    [chatSessions, setChatSessions, session.id, artifact, apiUrl]
  );

  const handleProposalRejection = useCallback(
    async (proposalId: string) => {
      try {
        // Add a rejection message to continue the conversation
        const rejectionMessage: ChatMessage = {
          id: `msg_${Date.now()}_user`,
          role: "user" as const,
          content:
            "I'd like to try a different approach. Could you suggest an alternative query?",
          timestamp: new Date().toISOString(),
          metadata: {
            error: `Proposal ${proposalId} was rejected by user`,
          },
        };

        const currentSession = chatSessions[session.id];
        if (!currentSession) {
          toast.error("Session not found");
          return;
        }

        // Add the rejection message
        setChatSessions({
          ...chatSessions,
          [session.id]: {
            ...currentSession,
            messages: [...currentSession.messages, rejectionMessage],
            updatedAt: new Date().toISOString(),
          },
        });

        toast.success("Proposal rejected - AI will suggest alternatives");
      } catch (error) {
        console.error("Failed to reject proposal:", error);
        toast.error("Failed to reject proposal");
      }
    },
    [chatSessions, setChatSessions, session.id]
  );

  // Handle proposal artifacts separately
  if (artifact.type === "proposal") {
    return (
      <ProposalArtifact
        artifact={artifact}
        session={session}
        onApprove={handleProposalApproval}
        onReject={handleProposalRejection}
        isExecuting={isExecuting}
      />
    );
  }

  // For other artifact types, use the regular renderer
  // Convert ChatArtifact to EnhancedArtifact format
  const enhancedArtifact = {
    ...artifact,
    timestamp: new Date().toISOString(),
    version: 1,
  };

  return (
    <ArtifactRenderer artifact={enhancedArtifact as any} session={session} />
  );
}
