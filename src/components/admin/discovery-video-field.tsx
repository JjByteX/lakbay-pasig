import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeVideoLink } from "@/lib/video-embed";

/**
 * True when the field is fine to save: empty (no video) or a link we can
 * embed. Both entry forms use it to gate their Save button.
 */
export function isVideoLinkValid(value: string): boolean {
  return value.trim() === "" || normalizeVideoLink(value) !== null;
}

/**
 * The one optional video link on a discovery content entry, used by both the
 * Discovery content tab and the trail builder's Trail Notes form. Staff paste
 * a normal YouTube or Facebook link, nothing else to fill in. The form holds
 * the text as typed, and the caller stores `normalizeVideoLink(value)` on save.
 */
export function DiscoveryVideoField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const invalid = !isVideoLinkValid(value);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="discovery-video-link">Video link</Label>
      <Input
        id="discovery-video-link"
        inputMode="url"
        placeholder="YouTube or Facebook link"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
      />
      {invalid && <p className="text-xs text-destructive">Use a YouTube or Facebook video link.</p>}
    </div>
  );
}
