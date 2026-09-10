// Stub for step 7 (Public app: Trails, per build-order.md item 7). No auth
// gate on the stub itself, per Phase 2.4, real guest-vs-registered behavior
// is out of scope until that step.
export default function TrailsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground">Trails</h1>
      <p className="text-base text-muted-foreground">Coming in step 7.</p>
    </div>
  );
}
