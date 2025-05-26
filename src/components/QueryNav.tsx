import { useState, useEffect } from "react";
import { useQuery } from "@/contexts/QueryContext";
import {
  Database,
  X,
  Edit,
  Save,
  ExternalLink,
  RefreshCw,
  MessageSquareHeart,
  Menu,
  Globe,
  EllipsisVertical,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import DatabaseSelector from "@/components/DatabaseSelector";
import QueryHistory from "@/components/QueryHistory";
import { ModeToggle } from "@/components/mode-toggle";
import Logo from "@/assets/logo.svg";
import { toast } from "sonner";

const VERSION = import.meta.env.PACKAGE_VERSION;

export default function QueryNav() {
  const { apiUrl, setApiUrl, loadDatabases } = useQuery();
  const [isEndpointEditing, setIsEndpointEditing] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Update temp URL when apiUrl changes
  useEffect(() => {
    setTempApiUrl(apiUrl);
  }, [apiUrl]);

  // Handle saving the endpoint
  const handleSaveEndpoint = () => {
    if (tempApiUrl.trim() === apiUrl) {
      setIsEndpointEditing(false);
      return;
    }

    if (!tempApiUrl.trim()) {
      toast.error("API endpoint cannot be empty");
      return;
    }

    // Notice about endpoint change
    toast.info("Changing API endpoint and refreshing connections...");
    setApiUrl(tempApiUrl.trim());
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

  // Handle mobile endpoint save
  const handleMobileEndpointSave = () => {
    if (!tempApiUrl.trim()) {
      toast.error("API endpoint cannot be empty");
      return;
    }

    if (tempApiUrl.trim() !== apiUrl) {
      toast.info("Changing API endpoint and refreshing connections...");
      setApiUrl(tempApiUrl.trim());
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="px-4 py-2 flex items-center justify-between">
        {/* Left Section - Logo and Brand */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <img src={Logo} alt="GigAPI Logo" className="h-6 w-6" />
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold leading-none">
                <span className="hidden sm:inline">GigAPI Query UI</span>
                <span className="sm:hidden">GigAPI</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Center Section - API Endpoint (large screens) */}
        <div className="flex-1 max-w-md mx-6 hidden xl:block">
          {isEndpointEditing ? (
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={tempApiUrl}
                  onChange={(e) => setTempApiUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="font-mono text-sm pl-10 bg-background"
                  placeholder="https://api.example.com"
                  autoFocus
                />
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveEndpoint}
                disabled={!tempApiUrl.trim()}
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
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className="group cursor-pointer border border-transparent hover:border-border rounded-lg px-4 py-2 bg-muted/20 hover:bg-muted/40 transition-colors"
              onClick={() => setIsEndpointEditing(true)}
              title="Click to edit API endpoint"
            >
              <div className="flex items-center justify-center space-x-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm truncate max-w-[300px]">
                  {apiUrl}
                </span>
                <Edit className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Right Section - Desktop Actions */}
        <div className="flex items-center space-x-2">
          {/* Desktop controls */}
          <div className="hidden md:flex items-center space-x-2">
            <DatabaseSelector />
            <QueryHistory />
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="More options">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      "https://gigapipe.com?utm_source=gigapi-ui&utm_medium=nav_link",
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  About Gigapipe
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      "https://github.com/gigapi/gigapi-ui/issues/new?title=&body=gigapi-ui%20v$%7BVERSION%7D%0A%0A%3C-Describe%20your%20issue%20here-%3E",
                      "_blank"
                    )
                  }
                >
                  <MessageSquareHeart className="h-4 w-4 mr-2" />
                  Feedback & Issues
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      "https://github.com/gigapi/gigapi",
                      "_blank"
                    )
                  }
                >
                  <Github className="h-4 w-4 mr-2" />
                  Gitub Repository
                </DropdownMenuItem>
                <span className="text-muted-foreground/70 text-xs px-2 py-1">
                  Query UI v{VERSION}
                </span>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center space-x-2 ">
            <ModeToggle />
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="flex items-center">
                <Button variant="outline" size="icon" title="Menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="top" className="pt-4 px-4">
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center space-x-2">
                    <img src={Logo} alt="GigAPI Logo" className="h-5 w-5" />
                    <span>GigAPI Querier</span>
                  </SheetTitle>
                </SheetHeader>

                <div className="py-6 space-y-6">
                  {/* Mobile Database Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center space-x-2">
                      <Database className="h-4 w-4" />
                      <span>Database Connection</span>
                    </h3>
                    <div className="pl-6 space-y-3">
                      <DatabaseSelector />
                    </div>
                  </div>

                  {/* Mobile API Endpoint Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center space-x-2">
                      <Globe className="h-4 w-4" />
                      <span>API Endpoint</span>
                    </h3>
                    <div className="pl-6 space-y-3">
                      <div className="flex space-x-2">
                        <Input
                          value={tempApiUrl}
                          onChange={(e) => setTempApiUrl(e.target.value)}
                          className="font-mono text-sm"
                          placeholder="https://mygigapipe.endpoint.com/query"
                        />
                        <Button
                          size="sm"
                          onClick={handleMobileEndpointSave}
                          disabled={!tempApiUrl.trim()}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Actions Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Quick Actions</h3>
                    <div className="pl-6 space-y-2">
                      <div className="flex space-x-2">
                        <div className="flex space-x-2">
                          <QueryHistory />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            loadDatabases();
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Links Section */}
                  <div className="space-y-3 pt-4 border-t">
                    <h3 className="text-sm font-semibold">Links</h3>
                    <div className="pl-6 space-y-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          window.open(
                            "https://gigapipe.com?utm_source=gigapi-ui&utm_medium=nav_link",
                            "_blank"
                          );
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full justify-start"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        About Gigapipe
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          window.open(
                            "https://github.com/gigapi/gigapi-ui/issues",
                            "_blank"
                          );
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full justify-start"
                      >
                        <MessageSquareHeart className="h-4 w-4 mr-2" />
                        Feedback & Issues
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
