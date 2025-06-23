import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { useDashboard } from '@/contexts/DashboardContext';
import { toast } from 'sonner';
import type { Dashboard } from '@/types/dashboard.types';

interface DashboardSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: Dashboard | null;
}

export function DashboardSettingsSheet({
  isOpen,
  onOpenChange,
  dashboard,
}: DashboardSettingsSheetProps) {
  const { updateDashboard } = useDashboard();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name);
      setDescription(dashboard.description || '');
      setTags((dashboard.metadata?.tags || []).join(', '));
    }
  }, [dashboard]);

  const handleSave = async () => {
    if (!dashboard) return;

    const updatedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    
    try {
      await updateDashboard(dashboard.id, {
        name,
        description,
        metadata: { ...dashboard.metadata, tags: updatedTags },
      });
      toast.success('Dashboard settings updated');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to update dashboard settings');
    }
  };

  if (!dashboard) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Dashboard Settings</SheetTitle>
          <SheetDescription>
            Manage your dashboard's name, description, and tags.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tags" className="text-right">
              Tags
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="col-span-3"
              placeholder="Comma-separated tags"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <Button type="button" onClick={handleSave}>
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
