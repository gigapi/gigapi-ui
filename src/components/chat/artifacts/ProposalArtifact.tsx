import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Play, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Database,
  Lightbulb,
  ArrowRight,
  Loader2,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import type { ChatSession } from '@/types/chat.types';
import type { ProposalArtifact as ProposalArtifactType, Artifact } from '@/types/artifact.types';

interface ProposalArtifactProps {
  artifact: Artifact;
  session: ChatSession;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
  isExecuting?: boolean;
}

export default function ProposalArtifact({ 
  artifact, 
  session: _session, 
  onApprove, 
  onReject,
  isExecuting = false
}: ProposalArtifactProps) {
  const [showQuery, setShowQuery] = useState(false);
  const [showNextSteps, setShowNextSteps] = useState(false);
  const proposal = artifact.data as ProposalArtifactType['data'];


  const handleApprove = () => {
    onApprove(artifact.id);
  };

  const handleReject = () => {
    onReject(artifact.id);
  };

  return (
    <Card className="w-full border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {proposal.proposal_type === 'chart_proposal' ? (
                  <>
                    <BarChart3 className="w-3 h-3 mr-1" />
                    Chart Proposal
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 mr-1" />
                    Query Proposal
                  </>
                )}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Database className="w-3 h-3 mr-1" />
                {proposal.database}
              </Badge>
              {proposal.approved && (
                <Badge variant="default" className="bg-green-500/10 text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approved
                </Badge>
              )}
              {proposal.execution_status === 'executing' && (
                <Badge variant="default" className="bg-blue-500/10 text-blue-600">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Executing
                </Badge>
              )}
              {proposal.execution_status === 'completed' && (
                <Badge variant="default" className="bg-green-500/10 text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Completed
                </Badge>
              )}
              {proposal.execution_status === 'failed' && (
                <Badge variant="default" className="bg-red-500/10 text-red-600">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Failed
                </Badge>
              )}
              {proposal.executed && (
                <Badge variant="default" className="bg-purple-500/10 text-purple-600">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Executed
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg text-foreground">{proposal.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {proposal.description}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Rationale */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-orange-800 mb-1">Why this query?</h4>
              <p className="text-sm text-orange-700">{proposal.rationale}</p>
            </div>
          </div>
        </div>

        {/* Chart Type for Chart Proposals */}
        {proposal.proposal_type === 'chart_proposal' && proposal.chart_type && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              <BarChart3 className="w-3 h-3 mr-1" />
              {proposal.chart_type} chart
            </Badge>
            {proposal.x_axis && (
              <Badge variant="outline" className="text-xs">
                X: {proposal.x_axis}
              </Badge>
            )}
            {proposal.y_axes && proposal.y_axes.length > 0 && (
              <Badge variant="outline" className="text-xs">
                Y: {proposal.y_axes.join(', ')}
              </Badge>
            )}
          </div>
        )}

        {/* Query Preview */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuery(!showQuery)}
            className="mb-2 text-muted-foreground hover:text-foreground"
          >
            <Eye className="w-4 h-4 mr-2" />
            {showQuery ? 'Hide' : 'Show'} Query
            {showQuery ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
          </Button>
          
          {showQuery && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                SQL Query
              </div>
              <pre className="text-sm font-mono bg-muted/50 p-3 overflow-x-auto">
                <code className="text-foreground">{proposal.query}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Next Steps */}
        {proposal.next_steps && proposal.next_steps.length > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNextSteps(!showNextSteps)}
              className="mb-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {showNextSteps ? 'Hide' : 'Show'} Next Steps
              {showNextSteps ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </Button>
            
            {showNextSteps && (
              <div className="bg-muted/50 border border-border rounded-lg p-3">
                <h4 className="font-medium text-sm text-foreground mb-2">After this query, I'll:</h4>
                <ul className="text-sm space-y-1">
                  {proposal.next_steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary mt-1 text-xs">•</span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Results Preview */}
        {proposal.results && proposal.results.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <h4 className="font-medium text-green-700 mb-2">Query Results</h4>
            <p className="text-sm text-green-600">
              Returned {proposal.results.length} rows
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {!proposal.approved && !proposal.executed && proposal.execution_status !== 'executing' && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleApprove}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              size="sm"
              disabled={isExecuting}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve & Execute
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleReject}
              className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
              size="sm"
              disabled={isExecuting}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </div>
        )}

        {/* Execution Status */}
        {proposal.execution_status === 'executing' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <p className="text-sm text-blue-600">
                Executing query...
              </p>
            </div>
          </div>
        )}

        {proposal.execution_status === 'completed' && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-600 font-medium">
                Query executed successfully!
              </p>
            </div>
            {proposal.result_summary && (
              <p className="text-sm text-gray-600 ml-6">
                {proposal.result_summary}
              </p>
            )}
            {proposal.execution_time && (
              <p className="text-xs text-gray-500 ml-6 mt-1">
                Executed in {proposal.execution_time}ms
              </p>
            )}
          </div>
        )}

        {proposal.execution_status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-600 font-medium">
                Query execution failed
              </p>
            </div>
            {proposal.execution_error && (
              <p className="text-sm text-gray-600 ml-6">
                {proposal.execution_error}
              </p>
            )}
          </div>
        )}

        {/* Legacy statuses for backward compatibility */}
        {proposal.approved && !proposal.executed && !proposal.execution_status && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-600">
              ✅ Approved - Query will be executed...
            </p>
          </div>
        )}

        {proposal.executed && !proposal.execution_status && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <p className="text-sm text-purple-600">
              ✅ Executed - Check the results above
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}