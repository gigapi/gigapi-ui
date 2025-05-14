import { useState, useEffect } from "react";
import { useQuery } from "../contexts/QueryContext";
import {
  Database,
  Settings,
  ChevronDown,
  X,
  Edit,
  Save,
  ExternalLink,
  FilePlus,
  RefreshCw,
  MessageSquareHeart
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import DatabaseSelector from "./DatabaseSelector";
import QueryHistory from "./QueryHistory";
import { ModeToggle } from "./mode-toggle";
import Logo from "../assets/logo.svg";
import { toast } from "sonner";

export default function QueryNav() {
  const { apiUrl, setApiUrl, loadDatabases, selectedDb, clearQuery, setSelectedTable } = useQuery();
  const [isEndpointEditing, setIsEndpointEditing] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Update temp URL when apiUrl changes
  useEffect(() => {
    setTempApiUrl(apiUrl);
  }, [apiUrl]);

  // Handle saving the endpoint
  const handleSaveEndpoint = () => {
    if (tempApiUrl === apiUrl) {
      setIsEndpointEditing(false);
      return;
    }
    
    // Notice about endpoint change
    toast.info("Changing API endpoint and refreshing connections...");
    
    // Update the API URL - this will trigger the useEffect in QueryContext
    // that clears state and reloads databases
    setApiUrl(tempApiUrl);
    setIsEndpointEditing(false);
  };

  // Handle API URL input key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEndpoint();
    } else if (e.key === "Escape") {
      setTempApiUrl(apiUrl);
      setIsEndpointEditing(false);
    }
  };

  // Handle starting a new query
  const handleNewQuery = () => {
    clearQuery();
    setSelectedTable(null);
    toast.success("Started new query");
  };

  return (
    <header className="border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
      {/* Left Section - Logo and DB */}
      <div className="flex items-center space-x-2 md:space-x-4">
        <div className="flex items-center space-x-2">
          <img src={Logo} alt="GigAPI Logo" className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold hidden sm:inline-block">
          GigAPI Query UI


          </h1>
        </div>

        {/* Database indicator - only show on non-mobile */}
        {!isEndpointEditing && (
          <div className="hidden md:flex items-center space-x-2 bg-muted/30 px-3 py-1 rounded-md">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {selectedDb || "No database selected"}
            </span>
          </div>
        )}
      </div>

      {/* Center Section - API Endpoint */}
      <div className="flex-1 max-w-lg mx-4 hidden lg:block">
        {isEndpointEditing ? (
          <div className="flex items-center space-x-2 w-full">
            <Input
              value={tempApiUrl}
              onChange={(e) => setTempApiUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="font-mono text-sm bg-input text-foreground border border-border rounded"
              placeholder="API Endpoint URL"
              autoFocus
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveEndpoint}
              className="flex-shrink-0"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTempApiUrl(apiUrl);
                setIsEndpointEditing(false);
              }}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        ) : (
          <div
            className="text-center text-sm text-muted-foreground cursor-pointer border border-transparent hover:border-border rounded px-3 py-1.5 font-mono truncate bg-muted/30 flex items-center justify-center group"
            onClick={() => setIsEndpointEditing(true)}
            title="Click to edit endpoint"
          >
            <span className="truncate">{apiUrl}</span>
            <Edit className="h-3.5 w-3.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center space-x-1 md:space-x-2">
        {/* Always visible controls */}
        <div className="hidden sm:block">
          <DatabaseSelector />
        </div>
        <div className="hidden sm:block">
          <QueryHistory />
        </div>
        <ModeToggle />

        {/* Settings menu for larger screens */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleNewQuery}>
                <FilePlus className="h-4 w-4 mr-2" />
                New Query
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => loadDatabases()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Schema
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEndpointEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit API Endpoint
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.open("https://gigapipe.com", "_blank")}
                className="text-muted-foreground"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                About Gigapipe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.open("https://github.com/gigapipe/gigapi-ui/issues", "_blank")}
                className="text-muted-foreground"
              >
                <MessageSquareHeart className="h-4 w-4 mr-2" />
                Feedback & Issues
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile menu button */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="top" className="pt-10">
            <SheetHeader>
              <SheetTitle>GigAPI Querier</SheetTitle>
            </SheetHeader>
            <div className="py-4 space-y-4">
              {/* Mobile DB selector */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Select Database</h3>
                <div className="w-full">
                  <DatabaseSelector />
                </div>
              </div>

              {/* Mobile API URL editor */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">API Endpoint</h3>
                <div className="flex gap-2">
                  <Input
                    value={tempApiUrl}
                    onChange={(e) => setTempApiUrl(e.target.value)}
                    className="font-mono text-sm bg-input text-foreground"
                    placeholder="API URL"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.info("Changing API endpoint and refreshing connections...");
                      setApiUrl(tempApiUrl);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Mobile actions */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewQuery}
                    className="flex-1"
                  >
                    <FilePlus className="h-4 w-4 mr-2" />
                    New Query
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      loadDatabases();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Schema
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1"
                  >
                    <QueryHistory />
                    History
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
