import { BARANGAYS } from "@/lib/fiestas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Barangay dropdown for the admin list pages. `extras` are the non-barangay
// labels (no pin, outside Pasig) present in the rows, see unmappedLabels().
export default function AdminBarangayFilter({
  value,
  onChange,
  extras,
}: Readonly<{ value: string; onChange: (value: string) => void; extras: string[] }>) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Barangay" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All barangays</SelectItem>
        {[...BARANGAYS, ...extras].map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
