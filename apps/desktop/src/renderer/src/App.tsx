import { useState } from "react";
import { Onboarding } from "./screens/Onboarding";
import { Scanning } from "./screens/Scanning";
import { ReportPreview } from "./screens/ReportPreview";
import { Connect } from "./screens/Connect";
import type { ScanReport } from "../../preload/index";

type Stage =
  | { name: "onboarding" }
  | { name: "scanning"; url: string }
  | { name: "report"; report: ScanReport }
  | { name: "connect"; report: ScanReport };

export function App() {
  const [stage, setStage] = useState<Stage>({ name: "onboarding" });

  return (
    <div className="shell">
      <div className="titlebar" />
      <div className="content">
        {stage.name === "onboarding" && <Onboarding onStart={(url) => setStage({ name: "scanning", url })} />}
        {stage.name === "scanning" && (
          <Scanning url={stage.url} onDone={(report) => setStage({ name: "report", report })} />
        )}
        {stage.name === "report" && (
          <ReportPreview
            report={stage.report}
            onRestart={() => setStage({ name: "onboarding" })}
            onConnect={() => setStage({ name: "connect", report: stage.report })}
          />
        )}
        {stage.name === "connect" && (
          <Connect displayName={stage.report.store.displayName} onBack={() => setStage({ name: "report", report: stage.report })} />
        )}
      </div>
    </div>
  );
}
