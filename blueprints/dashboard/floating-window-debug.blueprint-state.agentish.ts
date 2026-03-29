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
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  sharedWindowHostExists: define.concept("SharedWindowHostExists"),
  ticketFixtureExists: define.concept("TicketFixtureExists"),
  dedicatedDebugFeatureMissing: define.concept("DedicatedDebugFeatureMissing"),
  visibleMeasurementSurfaceMissing: define.concept("VisibleMeasurementSurfaceMissing"),
  shellVsContentDiagnosisGap: define.concept("ShellVsContentDiagnosisGap"),
};

FloatingWindowDebugBlueprintState.defines(`
- CurrentImplementationStatus means the repository already ships a shared dashboard floating-window host plus ticket-window integration, but it does not yet ship a dedicated floating-window debug tab.
- AssessmentConfidence is medium because the comparison is grounded in direct source inspection and prior worker-browser debugging discussion, but the new feature is not yet implemented on this branch.
- ImplementationEvidence includes DashboardWindowLayer, FloatingTicketWindows, TicketView, and the dashboard plugin registry.
- ImplementationGap means the dashboard still lacks a first-party floating-window lab with shell-only fixtures, real content fixtures, named presets, and visible live measurements.
- KnownIssue means current floating-window debugging still depends too much on ad hoc browser eval and real TicketView content, which makes shell bugs harder to separate from content-layout bugs.
`);

FloatingWindowDebugBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.sharedWindowHostExists,
  CurrentReality.ticketFixtureExists,
  CurrentReality.dedicatedDebugFeatureMissing,
  CurrentReality.visibleMeasurementSurfaceMissing,
  CurrentReality.shellVsContentDiagnosisGap,
);

CurrentReality.sharedWindowHostExists.means(`
- DashboardWindowLayer already provides shared shell-owned window chrome
- shared windows already persist across dashboard tab switches
`);

CurrentReality.ticketFixtureExists.means(`
- FloatingTicketWindows already renders TicketView inside the shared window host
- ticket content already proves that feature-owned content can live inside shared shell windows
`);

CurrentReality.dedicatedDebugFeatureMissing.means(`
- there is no dashboard tab dedicated to floating-window diagnosis
- shell-only fixtures and reproducible presets are not yet available in-product
`);

CurrentReality.visibleMeasurementSurfaceMissing.means(`
- repeated width, scale, and overflow inspection still relies on browser eval or transient debugging output
- the dashboard does not yet expose first-party live measurements for floating-window specimens
`);

CurrentReality.shellVsContentDiagnosisGap.means(`
- current floating-window investigation still mixes shell behavior with TicketView behavior too early
- the missing debug lab makes it harder to prove whether a bug belongs to shared shell math or fixture content layout
`);

when(CurrentReality.sharedWindowHostExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.ticketFixtureExists.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.evidence));

when(CurrentReality.dedicatedDebugFeatureMissing.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.gap, Assessment.issue));

when(CurrentReality.visibleMeasurementSurfaceMissing.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.gap, Assessment.issue));

when(CurrentReality.shellVsContentDiagnosisGap.exists())
  .then(FloatingWindowDebugBlueprintState.records(Assessment.gap, Assessment.issue));
