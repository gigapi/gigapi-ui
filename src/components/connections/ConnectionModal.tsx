import  { useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  ServerCrash,
  RefreshCw,
  Server,
  Shield,
  Key,
  Lock,
} from "lucide-react";
import {
  connectionsAtom,
  selectedConnectionIdAtom,
  addConnectionAtom,
  removeConnectionAtom,
  updateConnectionAtom,
  connectAtom,
  switchConnectionAndResetAtom,
  type Connection,
  type AuthType,
  type Credentials,
} from "@/atoms/connection-atoms";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionModal({ open, onOpenChange }: ConnectionModalProps) {
  const [connections] = useAtom(connectionsAtom);
  const [selectedConnectionId] = useAtom(selectedConnectionIdAtom);
  const addConnection = useSetAtom(addConnectionAtom);
  const removeConnection = useSetAtom(removeConnectionAtom);
  const updateConnection = useSetAtom(updateConnectionAtom);
  const connect = useSetAtom(connectAtom);
  const switchConnectionAndReset = useSetAtom(switchConnectionAndResetAtom);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<{
    name: string;
    url: string;
    authType: AuthType;
    credentials?: Credentials;
  }>({ name: "", url: "", authType: "none", credentials: undefined });
  const [newConnection, setNewConnection] = useState<{
    name: string;
    url: string;
    authType: AuthType;
    credentials?: Credentials;
  }>({ name: "", url: "", authType: "none", credentials: undefined });
  const [isAdding, setIsAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleAddConnection = () => {
    if (newConnection.name && newConnection.url) {
      addConnection({
        name: newConnection.name,
        url: newConnection.url,
        authType: newConnection.authType,
        credentials: newConnection.credentials,
      });
      setNewConnection({ name: "", url: "", authType: "none", credentials: undefined });
      setIsAdding(false);
      // Don't auto-select, let user test first
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    setTestingId(connectionId);
    try {
      await connect({ connectionId });
    } finally {
      setTestingId(null);
    }
  };

  const handleUpdateConnection = (connectionId: string, updates: Partial<Connection>) => {
    updateConnection(connectionId, updates);
    setEditingId(null);
  };

  const getAuthTypeLabel = (authType: AuthType) => {
    switch (authType) {
      case 'none': return 'None';
      case 'api-key': return 'API Key';
      case 'basic-auth': return 'Basic Auth (Key + Secret)';
      case 'api-key-secret': return 'API Key + Secret Headers';
      default: return 'Unknown';
    }
  };

  const getAuthIcon = (authType: AuthType) => {
    switch (authType) {
      case 'none': return null;
      case 'api-key': return <Key className="h-3.5 w-3.5" />;
      case 'basic-auth': return <Lock className="h-3.5 w-3.5" />;
      case 'api-key-secret': return <Shield className="h-3.5 w-3.5" />;
      default: return null;
    }
  };

  const getStatusIcon = (state: Connection["state"]) => {
    switch (state) {
      case "connected":
      case "empty":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "connecting":
      case "reconnecting":
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case "failed":
        return <ServerCrash className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (connection: Connection) => {
    const statusColors = {
      connected: "bg-green-500/10 text-green-700 border-green-200",
      empty: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
      connecting: "bg-blue-500/10 text-blue-700 border-blue-200",
      reconnecting: "bg-orange-500/10 text-orange-700 border-orange-200",
      failed: "bg-red-500/10 text-red-700 border-red-200",
      disconnected: "bg-gray-500/10 text-gray-700 border-gray-200",
    };

    return (
      <Badge className={`${statusColors[connection.state]} capitalize`}>
        {connection.state}
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Connections</DialogTitle>
            <DialogDescription>
              Add, edit, or remove API endpoint connections. Select which connection to use for queries.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Connection List */}
            <div className="space-y-2">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className={`p-4 rounded-lg border ${
                    selectedConnectionId === connection.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  } transition-colors`}
                >
                  {editingId === connection.id ? (
                    <div className="space-y-3">
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor={`name-${connection.id}`}>Name</Label>
                          <Input
                            id={`name-${connection.id}`}
                            value={editingConnection.name}
                            onChange={(e) => 
                              setEditingConnection({ ...editingConnection, name: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateConnection(connection.id, editingConnection);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`url-${connection.id}`}>URL</Label>
                          <Input
                            id={`url-${connection.id}`}
                            value={editingConnection.url}
                            onChange={(e) => 
                              setEditingConnection({ ...editingConnection, url: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateConnection(connection.id, editingConnection);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`auth-type-${connection.id}`}>Authentication Type</Label>
                          <Select
                            value={editingConnection.authType}
                            onValueChange={(value: AuthType) => 
                              setEditingConnection({ 
                                ...editingConnection, 
                                authType: value,
                                credentials: value === 'none' ? undefined : (editingConnection.credentials || {})
                              })
                            }
                          >
                            <SelectTrigger id={`auth-type-${connection.id}`}>
                              <SelectValue placeholder="Select authentication type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="api-key">API Key</SelectItem>
                              <SelectItem value="basic-auth">Basic Auth (Key + Secret)</SelectItem>
                              <SelectItem value="api-key-secret">API Key + Secret Headers</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {editingConnection.authType === 'api-key' && (
                          <>
                            <div>
                              <Label htmlFor={`api-key-${connection.id}`}>API Key</Label>
                              <Input
                                id={`api-key-${connection.id}`}
                                type="password"
                                placeholder="Enter your API key"
                                value={editingConnection.credentials?.apiKey || ''}
                                onChange={(e) => 
                                  setEditingConnection({ 
                                    ...editingConnection, 
                                    credentials: { 
                                      ...editingConnection.credentials, 
                                      apiKey: e.target.value 
                                    }
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Delivery Method</Label>
                              <RadioGroup
                                value={editingConnection.credentials?.deliveryMethod || 'header'}
                                onValueChange={(value) => 
                                  setEditingConnection({ 
                                    ...editingConnection, 
                                    credentials: { 
                                      ...editingConnection.credentials, 
                                      deliveryMethod: value as 'header' | 'url' 
                                    }
                                  })
                                }
                                className="flex gap-6 mt-2"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="header" id={`edit-header-${connection.id}`} />
                                  <Label htmlFor={`edit-header-${connection.id}`} className="font-normal cursor-pointer">
                                    Send as Header (X-API-Key)
                                  </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="url" id={`edit-url-param-${connection.id}`} />
                                  <Label htmlFor={`edit-url-param-${connection.id}`} className="font-normal cursor-pointer">
                                    Send as URL Parameter (api_key)
                                  </Label>
                                </div>
                              </RadioGroup>
                            </div>
                          </>
                        )}
                        
                        {(editingConnection.authType === 'basic-auth' || editingConnection.authType === 'api-key-secret') && (
                          <>
                            <div>
                              <Label htmlFor={`api-key-${connection.id}`}>
                                {editingConnection.authType === 'basic-auth' ? 'API Key (Username)' : 'API Key'}
                              </Label>
                              <Input
                                id={`api-key-${connection.id}`}
                                type="password"
                                placeholder="Enter your API key"
                                value={editingConnection.credentials?.apiKey || ''}
                                onChange={(e) => 
                                  setEditingConnection({ 
                                    ...editingConnection, 
                                    credentials: { 
                                      ...editingConnection.credentials, 
                                      apiKey: e.target.value 
                                    }
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor={`api-secret-${connection.id}`}>
                                {editingConnection.authType === 'basic-auth' ? 'API Secret (Password)' : 'API Secret'}
                              </Label>
                              <Input
                                id={`api-secret-${connection.id}`}
                                type="password"
                                placeholder="Enter your API secret"
                                value={editingConnection.credentials?.apiSecret || ''}
                                onChange={(e) => 
                                  setEditingConnection({ 
                                    ...editingConnection, 
                                    credentials: { 
                                      ...editingConnection.credentials, 
                                      apiSecret: e.target.value 
                                    }
                                  })
                                }
                              />
                            </div>
                            {editingConnection.authType === 'basic-auth' && (
                              <div className="text-sm text-muted-foreground">
                                Will be sent as Basic Authentication header (base64 encoded)
                              </div>
                            )}
                            {editingConnection.authType === 'api-key-secret' && (
                              <div className="text-sm text-muted-foreground">
                                Will be sent as X-API-Key and X-API-Secret headers
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateConnection(connection.id, editingConnection)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(connection.state)}
                          <h3 className="font-medium">{connection.name}</h3>
                          {selectedConnectionId === connection.id && (
                            <Badge variant="default" className="ml-2">
                              Active
                            </Badge>
                          )}
                          {getStatusBadge(connection)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                          <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                          <p className="font-mono truncate min-w-0">{connection.url}</p>
                        </div>
                        {connection.authType !== 'none' && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {getAuthIcon(connection.authType)}
                            <span>{getAuthTypeLabel(connection.authType)}</span>
                          </div>
                        )}
                        {connection.databases.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {connection.databases.length} database(s) available
                          </div>
                        )}
                        {connection.error && (
                          <div className="text-xs text-red-600">{connection.error}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestConnection(connection.id)}
                          disabled={testingId === connection.id}
                          title="Test connection"
                        >
                          {testingId === connection.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-1">Test</span>
                        </Button>
                        {selectedConnectionId !== connection.id && (
                          <Button
                            size="sm"
                            variant={connection.state === "connected" || connection.state === "empty" ? "default" : "outline"}
                            onClick={() => {
                              switchConnectionAndReset(connection.id);
                            }}
                            disabled={connection.state === "failed" || connection.state === "disconnected"}
                            title={connection.state === "failed" ? "Test connection first" : "Switch to this connection"}
                          >
                            <Server className="h-4 w-4 mr-1" />
                            Use
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(connection.id);
                            setEditingConnection({
                              name: connection.name,
                              url: connection.url,
                              authType: connection.authType || 'none',
                              credentials: connection.credentials,
                            });
                          }}
                          title="Edit connection"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmId(connection.id)}
                          disabled={connections.length === 1}
                          title="Delete connection"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Separator />

            {/* Add New Connection */}
            {isAdding ? (
              <div className="space-y-3 p-4 border rounded-lg">
                <h3 className="font-medium">Add New Connection</h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="new-name">Name</Label>
                    <Input
                      id="new-name"
                      placeholder="e.g., Production"
                      value={newConnection.name}
                      onChange={(e) =>
                        setNewConnection({ ...newConnection, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-url">URL</Label>
                    <Input
                      id="new-url"
                      placeholder="https://api.example.com/query"
                      value={newConnection.url}
                      onChange={(e) =>
                        setNewConnection({ ...newConnection, url: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-auth-type">Authentication Type</Label>
                    <Select
                      value={newConnection.authType}
                      onValueChange={(value: AuthType) => 
                        setNewConnection({ 
                          ...newConnection, 
                          authType: value,
                          credentials: value === 'none' ? undefined : (newConnection.credentials || {})
                        })
                      }
                    >
                      <SelectTrigger id="new-auth-type">
                        <SelectValue placeholder="Select authentication type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="api-key">API Key</SelectItem>
                        <SelectItem value="basic-auth">Basic Auth (Key + Secret)</SelectItem>
                        <SelectItem value="api-key-secret">API Key + Secret Headers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {newConnection.authType === 'api-key' && (
                    <>
                      <div>
                        <Label htmlFor="new-api-key">API Key</Label>
                        <Input
                          id="new-api-key"
                          type="password"
                          placeholder="Enter your API key"
                          value={newConnection.credentials?.apiKey || ''}
                          onChange={(e) =>
                            setNewConnection({ 
                              ...newConnection, 
                              credentials: { 
                                ...newConnection.credentials, 
                                apiKey: e.target.value 
                              }
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Delivery Method</Label>
                        <RadioGroup
                          value={newConnection.credentials?.deliveryMethod || 'header'}
                          onValueChange={(value) =>
                            setNewConnection({ 
                              ...newConnection, 
                              credentials: { 
                                ...newConnection.credentials, 
                                deliveryMethod: value as 'header' | 'url' 
                              }
                            })
                          }
                          className="flex gap-6 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="header" id="new-header" />
                            <Label htmlFor="new-header" className="font-normal cursor-pointer">
                              Send as Header (X-API-Key)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="url" id="new-url-param" />
                            <Label htmlFor="new-url-param" className="font-normal cursor-pointer">
                              Send as URL Parameter (api_key)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </>
                  )}
                  
                  {(newConnection.authType === 'basic-auth' || newConnection.authType === 'api-key-secret') && (
                    <>
                      <div>
                        <Label htmlFor="new-api-key">
                          {newConnection.authType === 'basic-auth' ? 'API Key (Username)' : 'API Key'}
                        </Label>
                        <Input
                          id="new-api-key"
                          type="password"
                          placeholder="Enter your API key"
                          value={newConnection.credentials?.apiKey || ''}
                          onChange={(e) =>
                            setNewConnection({ 
                              ...newConnection, 
                              credentials: { 
                                ...newConnection.credentials, 
                                apiKey: e.target.value 
                              }
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-api-secret">
                          {newConnection.authType === 'basic-auth' ? 'API Secret (Password)' : 'API Secret'}
                        </Label>
                        <Input
                          id="new-api-secret"
                          type="password"
                          placeholder="Enter your API secret"
                          value={newConnection.credentials?.apiSecret || ''}
                          onChange={(e) =>
                            setNewConnection({ 
                              ...newConnection, 
                              credentials: { 
                                ...newConnection.credentials, 
                                apiSecret: e.target.value 
                              }
                            })
                          }
                        />
                      </div>
                      {newConnection.authType === 'basic-auth' && (
                        <div className="text-sm text-muted-foreground">
                          Will be sent as Basic Authentication header (base64 encoded)
                        </div>
                      )}
                      {newConnection.authType === 'api-key-secret' && (
                        <div className="text-sm text-muted-foreground">
                          Will be sent as X-API-Key and X-API-Secret headers
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddConnection}
                    disabled={!newConnection.name || !newConnection.url}
                  >
                    Add Connection
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsAdding(false);
                      setNewConnection({ name: "", url: "", authType: "none", credentials: undefined });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setIsAdding(true)}
                className="w-full"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Connection
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this connection? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) {
                  removeConnection(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}