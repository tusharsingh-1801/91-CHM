import { useEffect, useState } from "react";
import "./App.css";
import {
  calculateNdvi,
  createField,
  askFieldAssistant,
  ingestSentinelScenes,
  ingestWeather,
  loadFields,
  loadNdvi,
  loadScenes,
} from "./lib/api";
import type { NdviObservation } from "./lib/api";
import { GoogleSatelliteMap } from "./lib/GoogleSatelliteMap";

type Field = {
  id?: string;
  name: string;
  crop: string;
  area: string;
  health: number;
  delta: string;
  color: string;
  canopyCoverage?: number | null;
  lastObservation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
type AlertItem = {
  title: string;
  field: string;
  time: string;
  severity: string;
  icon: string;
};

const initialFields: Field[] = [
  {
    name: "North block",
    crop: "Winter wheat",
    area: "1.93 ha",
    health: 82,
    delta: "+4.2%",
    color: "green",
    latitude: 28.613865,
    longitude: 77.209175,
  },
  {
    name: "River bend",
    crop: "Soybean",
    area: "31.4 ha",
    health: 68,
    delta: "-6.8%",
    color: "amber",
  },
  {
    name: "East orchard",
    crop: "Apple",
    area: "18.6 ha",
    health: 91,
    delta: "+1.4%",
    color: "green",
  },
];
const initialAlerts: AlertItem[] = [
  {
    title: "Moisture stress detected",
    field: "River bend",
    time: "Today, 08:42",
    severity: "high",
    icon: "!",
  },
  {
    title: "Vegetation vigor improving",
    field: "North block",
    time: "Yesterday, 16:10",
    severity: "positive",
    icon: "↗",
  },
  {
    title: "Cloud cover affected scan",
    field: "East orchard",
    time: "Aug 24, 11:28",
    severity: "neutral",
    icon: "○",
  },
];

function ndviChartY(value: number) {
  return 210 - Math.max(0, Math.min(1, value)) * 180;
}

function createNdviChartPath(observations: NdviObservation[]) {
  const values = observations
    .map((observation) => Number(observation.ndvi_value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return "";
  const lastIndex = Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = (index / lastIndex) * 700;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${ndviChartY(value).toFixed(2)}`;
    })
    .join(" ");
}

function formatObservationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function filterNdviByPeriod(observations: NdviObservation[], period: string) {
  if (period === "This season") return observations;
  const latest = observations.at(-1);
  if (!latest) return [];
  const latestDate = new Date(latest.observed_on);
  const days = period === "Last 30 days" ? 30 : 90;
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - days);
  return observations.filter((observation) => {
    const observedAt = new Date(observation.observed_on);
    return !Number.isNaN(observedAt.getTime()) && observedAt >= cutoff;
  });
}

function App() {
  const [fields, setFields] = useState(initialFields);
  const [activeField, setActiveField] = useState(0);
  const [layer, setLayer] = useState("NDVI");
  const [alertFilter, setAlertFilter] = useState("All alerts");
  const [trendPeriod, setTrendPeriod] = useState("Last 90 days");
  const [view, setView] = useState("Overview");
  const [mapZoom, setMapZoom] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [modal, setModal] = useState("");
  const [toast, setToast] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldCrop, setNewFieldCrop] = useState("");
  const googleMapsEnabled = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [, setDataSource] = useState("Connecting to PostgreSQL...");
  const [latestNdvi, setLatestNdvi] = useState<number | null>(null);
  const [ndviObservations, setNdviObservations] = useState<NdviObservation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantLanguage, setAssistantLanguage] = useState("en-IN");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const field = fields[activeField] ?? fields[0];
  const displayedLatestNdvi = field.id ? latestNdvi : null;
  const filteredNdviObservations = field.id
    ? filterNdviByPeriod(ndviObservations, trendPeriod)
    : [];
  const chartLatestNdvi = Number(filteredNdviObservations.at(-1)?.ndvi_value);
  const ndviChartPath = createNdviChartPath(filteredNdviObservations);
  const chartLabels = filteredNdviObservations
    .slice(-6)
    .map((observation) => formatObservationDate(observation.observed_on));
  const filteredAlerts = initialAlerts.filter(
    (alert) =>
      alertFilter === "All alerts" ||
      (alertFilter === "High priority" && alert.severity === "high") ||
      (alertFilter === "Positive" && alert.severity === "positive"),
  );

  useEffect(() => {
    loadFields()
      .then((data) => {
        if (!data.length) return;
        setFields(
          data.map((item) => ({
            id: item.id,
            name: item.name,
            crop: item.crop,
            area: `${item.area_hectares} ha`,
            health: item.health_score,
            delta: `${item.health_delta >= 0 ? "+" : ""}${item.health_delta}%`,
            color: item.health_score > 75 ? "green" : "amber",
            canopyCoverage: item.canopy_coverage,
            lastObservation: item.last_observation,
            latitude: item.latitude,
            longitude: item.longitude,
          })),
        );
        setDataSource("PostgreSQL connected");
      })
      .catch(() => setDataSource("Demo data"));
  }, []);

  useEffect(() => {
    if (!field.id) {
      return;
    }
    loadNdvi(field.id)
      .then((observations) => {
        setNdviObservations(observations);
        const latest = observations.at(-1);
        setLatestNdvi(latest ? Number(latest.ndvi_value) : null);
      })
      .catch(() => {
        setLatestNdvi(null);
        setNdviObservations([]);
      });
  }, [field.id]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const askAssistant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assistantQuestion.trim()) return;
    setAssistantLoading(true);
    setAssistantAnswer("");
    try {
      const result = await askFieldAssistant(assistantQuestion, field.id, assistantLanguage);
      setAssistantAnswer(result.answer);
    } catch (error) {
      setAssistantAnswer(error instanceof Error ? error.message : "Assistant unavailable");
    } finally {
      setAssistantLoading(false);
    }
  };
  const exportReport = () => {
    const report = `TERRASCOPE FIELD REPORT\nField: ${field.name}\nCrop: ${field.crop}\nArea: ${field.area}\nHealth score: ${field.health}/100\nNDVI average: ${displayedLatestNdvi?.toFixed(4) ?? "unavailable"}\nCanopy coverage: ${field.canopyCoverage ?? "unavailable"}${field.canopyCoverage !== null && field.canopyCoverage !== undefined ? "%" : ""}\nObservation: ${field.lastObservation ?? "unavailable"}\n`;
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${field.name.replace(" ", "-").toLowerCase()}-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Report downloaded");
  };
  const addField = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newFieldName.trim() || !newFieldCrop.trim()) return;
    createField(newFieldName, newFieldCrop)
      .then((created) => {
        setFields([
          ...fields,
          {
            name: created.name,
            crop: created.crop,
            area: `${created.area_hectares} ha`,
            health: created.health_score,
            delta: "New",
            color: "green",
            canopyCoverage: created.canopy_coverage,
            lastObservation: created.last_observation,
          },
        ]);
        setActiveField(fields.length);
        setNewFieldName("");
        setNewFieldCrop("");
        setModal("");
        notify("Field added to PostgreSQL");
      })
      .catch(() => notify("Could not save field. Check the API connection."));
  };
  const collectFieldData = async () => {
    if (!field.id) {
      notify("Select a database field first");
      return;
    }
    setSyncing(true);
    try {
      const weather = await ingestWeather(field.id);
      const scenes = await ingestSentinelScenes(field.id);
      const availableScenes = await loadScenes(field.id);
      const latestScene = availableScenes[0];
      if (latestScene) {
        await calculateNdvi(field.id, latestScene.scene_id);
        const observations = await loadNdvi(field.id);
        setNdviObservations(observations);
        const latestObservation = observations.at(-1);
        setLatestNdvi(
          latestObservation ? Number(latestObservation.ndvi_value) : null,
        );
      }
      notify(
        `${weather.imported} weather and ${scenes.imported} satellite records synced`,
      );
    } catch {
      notify("Data sync failed. Check coordinates and API settings.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("Overview")}>
          <span className="brand-mark">◒</span>
          <span>
            terra<span className="brand-accent">scope</span>
          </span>
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {["Overview", "Field map", "Reports", "Settings"].map(
            (item, index) => (
              <button
                key={item}
                className={`nav-item ${view === item ? "active" : ""}`}
                onClick={() => {
                  setView(item);
                  notify(`${item} view selected`);
                }}
              >
                <span>{["▦", "⌁", "◫", "⚙"][index]}</span>
                {item}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sync-status">
            <span className="pulse-dot" />
            Data synced <strong>2m ago</strong>
          </div>
          <button className="profile" onClick={() => setModal("profile")}>
            <div className="avatar">TS</div>
            <div>
              <b>Tushar Singh</b>
              <small>Field manager</small>
            </div>
            <span className="more">•••</span>
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">FIELD INTELLIGENCE / 2026 SEASON</p>
            <h1>{view === "Overview" ? "Good morning, Tushar" : view}</h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Search"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              ⌕
            </button>
            <button
              className="notification"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
            >
              ♧<i />
            </button>
            <button className="assistant-button" onClick={() => setModal("assistant")}>
              ✦ <span>Ask TerraScope</span>
            </button>
            <button className="export-button" onClick={exportReport}>
              ⇩ <span>Export report</span>
            </button>
          </div>
          {searchOpen && (
            <div className="search-box">
              <input
                autoFocus
                placeholder="Search fields or crops..."
                onChange={(event) => {
                  const result = fields.findIndex((item) =>
                    item.name
                      .toLowerCase()
                      .includes(event.target.value.toLowerCase()),
                  );
                  if (result >= 0) setActiveField(result);
                }}
              />
              <button onClick={() => setSearchOpen(false)}>×</button>
            </div>
          )}
          {notificationsOpen && (
            <div className="notification-pop">
              <b>Notifications</b>
              <p>1 high priority moisture alert</p>
              <p>Satellite scan synced 2 minutes ago</p>
            </div>
          )}
        </header>
        <div className="field-selector-row">
          <div className="field-tabs">
            {fields.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                className={`field-tab ${activeField === index ? "selected" : ""}`}
                onClick={() => setActiveField(index)}
              >
                <span className={`field-dot ${item.color}`} />
                {item.name}
                <small>{item.area}</small>
              </button>
            ))}
          </div>
          <div className="field-actions">
            <button
              className="sync-button"
              onClick={collectFieldData}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "↻ Sync satellite data"}
            </button>
            <button className="add-field" onClick={() => setModal("add-field")}>
              ＋ Add field
            </button>
          </div>
        </div>

        <section className="hero-grid">
          {googleMapsEnabled &&
            field.latitude &&
            field.longitude &&
            layer === "True color" && (
              <div className="google-map-overlay">
                <GoogleSatelliteMap
                  latitude={field.latitude}
                  longitude={field.longitude}
                  fieldName={field.name}
                  zoom={mapZoom}
                />
              </div>
            )}
          <div className="map-panel">
            <div className="map-toolbar">
              <div>
                <span className="live-dot" />
                Sentinel-2 imagery <span className="muted">· 24 Aug 2026</span>
              </div>
              <div className="layer-switcher">
                {["True color", "NDVI", "Moisture"].map((item) => (
                  <button
                    key={item}
                    className={layer === item ? "active" : ""}
                    onClick={() => setLayer(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`satellite-map layer-${layer.toLowerCase().replace(" ", "-")} zoom-${mapZoom}`}
            >
              <div className="map-grid" />
              <div className="field-shape shape-one" />
              <div className="field-shape shape-two" />
              <div className="field-shape shape-three" />
              <div className="field-shape shape-four" />
              <div className="map-label label-one">
                NORTH BLOCK <span>42.8 ha</span>
              </div>
              <div className="map-label label-two">
                RIVER BEND <span>31.4 ha</span>
              </div>
              <div className="map-label label-three">
                EAST ORCHARD <span>18.6 ha</span>
              </div>
              <div className="map-crosshair">＋</div>
              <div className="map-controls">
                <button onClick={() => setMapZoom(Math.min(mapZoom + 1, 3))}>
                  ＋
                </button>
                <button onClick={() => setMapZoom(Math.max(mapZoom - 1, 1))}>
                  −
                </button>
                <button
                  onClick={() => {
                    setMapZoom(1);
                    notify("Map centered on all fields");
                  }}
                >
                  ⌖
                </button>
              </div>
              <div className="map-scale">
                {mapZoom === 3 ? "125 m" : mapZoom === 2 ? "250 m" : "500 m"}
              </div>
            </div>
            <div className="map-footer">
              <span>
                Layer: <b>{layer}</b>
              </span>
              <span className="legend">
                <i className="legend-low" />
                Low <i className="legend-mid" />
                Moderate <i className="legend-high" />
                Healthy
              </span>
              <span>© Sentinel Hub</span>
            </div>
          </div>
          <div className="health-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">SELECTED FIELD</p>
                <h2>{field.name}</h2>
                <span className="crop-label">
                  {field.crop} · {field.area}
                </span>
              </div>
              <button
                className="dots-button"
                onClick={() => setModal("field-actions")}
              >
                •••
              </button>
            </div>
            <div className="health-score">
              <div
                className="score-ring"
                style={
                  {
                    "--score": `${field.health * 3.6}deg`,
                  } as React.CSSProperties
                }
              >
                <div>
                  <strong>{field.health}</strong>
                  <small>/ 100</small>
                </div>
              </div>
              <div>
                <span className="status-pill">
                  ● {field.health > 0 ? "Good health" : "Awaiting scan"}
                </span>
                <p>
                  {field.health > 0
                    ? "Vegetation is thriving across most of the field."
                    : "Add imagery to calculate crop health."}
                </p>
              </div>
            </div>
            <div className="metric-list">
              <div>
                <span>NDVI average</span>
                <b>{displayedLatestNdvi !== null ? displayedLatestNdvi.toFixed(4) : "—"}</b>
                <em className="up">↗ {field.delta}</em>
              </div>
              <div>
                <span>Canopy coverage</span>
                <b>{field.canopyCoverage !== null && field.canopyCoverage !== undefined ? `${field.canopyCoverage}%` : "—"}</b>
                <em>+2.1%</em>
              </div>
              <div>
                <span>Last observation</span>
                <b>{field.lastObservation ?? "—"}</b>
                <em>{field.lastObservation ? "Recorded observation" : "Unavailable"}</em>
              </div>
            </div>
            <button className="full-report" onClick={() => setModal("report")}>
              View field report <span>→</span>
            </button>
          </div>
        </section>

        <section className="lower-grid">
          <div className="trend-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">VEGETATION TREND</p>
                <h2>NDVI over time</h2>
              </div>
              <select
                aria-label="Trend period"
                value={trendPeriod}
                onChange={(event) => {
                  setTrendPeriod(event.target.value);
                  notify(`Showing ${event.target.value.toLowerCase()}`);
                }}
              >
                <option>Last 90 days</option>
                <option>Last 30 days</option>
                <option>This season</option>
              </select>
            </div>
            <div className="chart">
              {!filteredNdviObservations.length && (
                <p
                  className="chart-empty-message"
                  style={{ color: "var(--muted)", padding: "48px 24px", textAlign: "center" }}
                >
                  No NDVI observations yet. Sync satellite data to start a trend.
                </p>
              )}
              <div className="y-labels">
                <span>0.9</span>
                <span>0.6</span>
                <span>0.3</span>
                <span>0.0</span>
              </div>
                <svg
                  style={!filteredNdviObservations.length ? { display: "none" } : undefined}
                viewBox="0 0 700 210"
                preserveAspectRatio="none"
                role="img"
                aria-label="NDVI trend chart"
              >
                <defs>
                  <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#b7d75a" stopOpacity=".32" />
                    <stop offset="100%" stopColor="#b7d75a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={ndviChartPath ? `${ndviChartPath} L700 210 L0 210Z` : "M0 210"}
                  fill="url(#area)"
                />
                <path
                  d={ndviChartPath || "M0 210"}
                  fill="none"
                  stroke="#cbe86b"
                  strokeWidth="3"
                />
                <circle
                  cx="700"
                  cy={Number.isFinite(chartLatestNdvi) ? ndviChartY(chartLatestNdvi) : 210}
                  r="5"
                  fill="#f6f8ed"
                  stroke="#cbe86b"
                  strokeWidth="3"
                />
              </svg>
              <div className="x-labels">
                {chartLabels.map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="alerts-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">FIELD SIGNALS</p>
                <h2>Recent alerts</h2>
              </div>
              <select
                aria-label="Alert filter"
                value={alertFilter}
                onChange={(event) => setAlertFilter(event.target.value)}
              >
                <option>All alerts</option>
                <option>High priority</option>
                <option>Positive</option>
              </select>
            </div>
            <div className="alert-list">
              {filteredAlerts.map((alert) => (
                <button
                  className="alert"
                  key={alert.title}
                  onClick={() => {
                    setActiveField(
                      fields.findIndex((item) => item.name === alert.field),
                    );
                    setModal("alert");
                  }}
                >
                  <span className={`alert-icon ${alert.severity}`}>
                    {alert.icon}
                  </span>
                  <span>
                    <b>{alert.title}</b>
                    <small>
                      {alert.field} · {alert.time}
                    </small>
                  </span>
                  <span className="arrow">→</span>
                </button>
              ))}
            </div>
            <button
              className="all-alerts"
              onClick={() => {
                setAlertFilter("All alerts");
                notify("Showing all field alerts");
              }}
            >
              See all alerts <span>→</span>
            </button>
          </div>
        </section>
      </section>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal("")}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal("")}>
              ×
            </button>
            {modal === "assistant" && (
              <>
                <p className="eyebrow">SARVAM AI / FIELD ASSISTANT</p>
                <h2>Ask about {field.name}</h2>
                <form onSubmit={askAssistant}>
                  <label>
                    Your question
                    <textarea
                      value={assistantQuestion}
                      onChange={(event) => setAssistantQuestion(event.target.value)}
                      placeholder="What should I check in this field today?"
                      rows={4}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <label>
                    Answer language
                    <select className="assistant-language" value={assistantLanguage} onChange={(event) => setAssistantLanguage(event.target.value)}>
                      <option value="en-IN">English</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="bn-IN">Bengali</option>
                      <option value="ta-IN">Tamil</option>
                      <option value="te-IN">Telugu</option>
                      <option value="mr-IN">Marathi</option>
                    </select>
                  </label>
                  <button className="modal-action" disabled={assistantLoading}>
                    {assistantLoading ? "Thinking..." : "Ask Sarvam →"}
                  </button>
                </form>
                {assistantAnswer && <p className="modal-copy assistant-answer">{assistantAnswer}</p>}
              </>
            )}
            {modal === "add-field" && (
              <>
                <p className="eyebrow">WORKSPACE</p>
                <h2>Add a new field</h2>
                <form onSubmit={addField}>
                  <label>
                    Field name
                    <input
                      value={newFieldName}
                      onChange={(event) => setNewFieldName(event.target.value)}
                      placeholder="e.g. South pasture"
                      required
                    />
                  </label>
                  <label>
                    Crop type
                    <input
                      value={newFieldCrop}
                      onChange={(event) => setNewFieldCrop(event.target.value)}
                      placeholder="e.g. Maize"
                      required
                    />
                  </label>
                  <button className="modal-action">Add field →</button>
                </form>
              </>
            )}
            {modal === "report" && (
              <>
                <p className="eyebrow">FIELD REPORT</p>
                <h2>{field.name}</h2>
                <p className="modal-copy">
                  The latest Sentinel-2 observation shows a health score of{" "}
                  <b>{field.health}/100</b> and an NDVI average of{" "}
                  <b>
                    {displayedLatestNdvi !== null ? displayedLatestNdvi.toFixed(4) : "unavailable"}
                  </b>.
                  Canopy coverage is currently estimated at{" "}
                  <b>
                    {field.canopyCoverage !== null && field.canopyCoverage !== undefined
                      ? `${field.canopyCoverage}%`
                      : "unavailable"}
                  </b>.
                </p>
                <button className="modal-action" onClick={exportReport}>
                  Download report ↓
                </button>
              </>
            )}
            {modal === "field-actions" && (
              <>
                <p className="eyebrow">FIELD ACTIONS</p>
                <h2>{field.name}</h2>
                <button
                  className="modal-row"
                  onClick={() => {
                    setModal("");
                    notify("Field marked for rescan");
                  }}
                >
                  Request fresh scan <span>→</span>
                </button>
                <button className="modal-row" onClick={exportReport}>
                  Export field data <span>→</span>
                </button>
              </>
            )}
            {modal === "alert" && (
              <>
                <p className="eyebrow">FIELD ALERT</p>
                <h2>Investigation started</h2>
                <p className="modal-copy">
                  Reviewing <b>{field.name}</b> for the selected alert. Compare
                  the NDVI and moisture layers before scheduling an inspection.
                </p>
                <button
                  className="modal-action"
                  onClick={() => {
                    setLayer("Moisture");
                    setModal("");
                    notify("Moisture layer enabled");
                  }}
                >
                  Open moisture layer →
                </button>
              </>
            )}
            {modal === "profile" && (
              <>
                <p className="eyebrow">ACCOUNT</p>
                <h2>Tushar Singh</h2>
                <p className="modal-copy">
                  Field manager · 3 monitored fields · Data synced 2 minutes
                  ago.
                </p>
                <button className="modal-action" onClick={() => setModal("")}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

export default App;
