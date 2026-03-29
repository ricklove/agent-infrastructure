/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const FloatingWindowDebugBlueprintState = define.system("FloatingWindowDebugBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Floating Window Debug blueprint",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  sharedWindowHostExists: define.concept("SharedWindowHostExists"),
  ticketFixtureExists: define.concept("TicketFixtureExists"),
  dedicatedDebugFeatureExists: define.concept("DedicatedDebugFeatureExists"),
  visibleMeasurementSurfaceExists: define.concept("VisibleMeasurementSurfaceExists"),
  shellVsContentDiagnosisSupported: define.concept("ShellVsContentDiagnosisSupported"),
  knownWorkerVerificationConstraint: define.concept("KnownWorkerVerificationConstraint"),
};

FloatingWindowDebugBlueprintState.defines(`
- CurrentImplementationStatus means this branch now ships a first-party dashboard debug tab for exercising the shared floating-window host with shell-only fixtures, TicketView, reproducible presets, and live measurements.
- AssessmentConfidence is high because the comparison is grounded in direct source inspection, local typecheck/build verification, and worker-browser screenshots captured against the implemented screen.
- ImplementationEvidence includes the floating-window-debug dashboard feature package, plugin registration in dashboard and dashboard-ui, DashboardWindowLayer scale-width fixes, and live screenshots from the worker-local dashboard.
- KnownIssue means worker-local verification still depends on a dedicated alternate dashboard port because port 3000 is already occupied on the worker host.
`);

FloatingWindowDebugBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.issue,
  CurrentReality.sharedWindowHostExists,
  CurrentReality.ticketFixtureExists,
  CurrentReality.dedicatedDebugFeatureExists,
  CurrentReality.visibleMeasurementSurfaceExists,
  CurrentReality.shellVsContentDiagnosisSupported,
  CurrentReality.knownWorkerVerificationConstraint,
);

CurrentReality.sharedWindowHostExists.means(`
- DashboardWindowLayer continues to provide shared shell-owned window chrome
- shared windows still persist across dashboard tab switches while the debug lab reuses that same shell
`);

CurrentReality.ticketFixtureExists.means(`
- the debug tab includes a local TicketView specimen rendered inside the shared window host
- ticket content can now be compared directly against shell-only fixtures under the same geometry and scale presets
`);

CurrentReality.dedicatedDebugFeatureExists.means(`
- the dashboard now ships a Debug Lab tab dedicated to floating-window diagnosis
- operators can open single specimens, duplicate them, open comparison sets, and open a fixture matrix without ad hoc browser eval
`);

CurrentReality.visibleMeasurementSurfaceExists.means(`
- the debug tab now exposes first-party live measurements for window size, viewport size, scaled content bounds, scaled scroll bounds, and overflow flags
- measurement logic now compares scaled scroll extents against the live viewport so tall fixtures report vertical overflow correctly
`);

CurrentReality.shellVsContentDiagnosisSupported.means(`
- shell-only fixtures, overflow fixtures, form controls, nested flex layouts, and TicketView all share the same preset catalog
- the lab now makes it straightforward to prove whether a rendering issue belongs to shared shell math or to the content fixture inside the shell
`);

CurrentReality.knownWorkerVerificationConstraint.means(`
- worker-local verification was run on DASHBOARD_PORT=3100 because another bun dashboard process already owned port 3000 on the worker host
- this constraint affected the test harness path but did not block screenshot verification of the implemented screen
`);

when(CurrentReality.sharedWindowHostExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.ticketFixtureExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.evidence));

when(CurrentReality.dedicatedDebugFeatureExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.visibleMeasurementSurfaceExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.shellVsContentDiagnosisSupported.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.knownWorkerVerificationConstraint.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.issue));
