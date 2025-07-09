import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';

import { useDashboard } from '@/atoms';
import ConfirmAction from '@/components/shared/ConfirmAction';
import { toast } from 'sonner';
import { X, Plus, Trash2, Settings, AlertTriangle } from 'lucide-react';
import type { Dashboard } from '@/types/dashboard.types';

interface DashboardSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: Dashboard | null;
  onDashboardDeleted?: () => void;
}

export function DashboardSettingsSheet({
  isOpen,
  onOpenChange,
  dashboard,
  onDashboardDeleted,
}: DashboardSettingsSheetProps) {
  const navigate = useNavigate();
  const { updateDashboard, deleteDashboard } = useDashboard();
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name);
      setDescription(dashboard.description || '');
      setTags(dashboard.metadata?.tags || []);
      setNewTag('');
    }
  }, [dashboard]);

  const handleSave = async () => {
    if (!dashboard || !name.trim()) {
      toast.error('Dashboard name is required');
      return;
    }

    setIsLoading(true);
    try {
      await updateDashboard(dashboard.id, {
        name: name.trim(),
        description: description.trim(),
        metadata: { 
          ...dashboard.metadata, 
          tags: tags.filter(tag => tag.trim() !== '')
        },
      });
      toast.success('Dashboard settings updated successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to update dashboard settings');
      console.error('Error updating dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleDeleteDashboard = async () => {
    if (!dashboard) return;
    
    setIsDeleting(true);
    try {
      await deleteDashboard(dashboard.id);
      toast.success(`Dashboard "${dashboard.name}" deleted successfully`);
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onDashboardDeleted?.();
      navigate('/');
    } catch (error) {
      toast.error('Failed to delete dashboard');
      console.error('Error deleting dashboard:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!dashboard) return null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <SheetTitle>Dashboard Settings</SheetTitle>
            </div>
            <SheetDescription>
              Manage your dashboard's information, tags, and settings.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex flex-col gap-6 p-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium">
                  Dashboard Name *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter dashboard name"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="description" className="text-sm font-medium">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this dashboard is for..."
                  className="mt-1 max-h-32"
                  rows={3}
                />
              </div>
            </div>

            {/* Tags Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tags</Label>
              
              {/* Add Tag Input */}
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Add a tag..."
                  className="flex-1"
                />
                <Button
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || tags.includes(newTag.trim())}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {/* Tags Display */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {tags.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No tags added yet. Tags help organize and categorize your dashboards.
                </p>
              )}
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <Label className="text-sm font-medium text-destructive">Danger Zone</Label>
              </div>
              
              <div className="p-4 border border-destructive/20 rounded-md bg-destructive/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Delete Dashboard</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this dashboard and all its panels. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button variant="outline" disabled={isLoading}>
                Cancel
              </Button>
            </SheetClose>
            <Button 
              onClick={handleSave} 
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <ConfirmAction
        isOpen={showDeleteConfirm}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${dashboard?.name}"? This action will permanently remove all panels, configurations, and associated data. This cannot be undone.`}
        confirmText={isDeleting ? "Deleting..." : "Delete Dashboard"}
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDeleteDashboard}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
