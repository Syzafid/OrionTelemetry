import { useEffect, useState } from "react";
import { BookOpen, Check, Compass, Keyboard, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTelemetry, type ModuleId } from "@/context/TelemetryContext";
import {
  WEB_GUIDE_TRACKS,
  getGuideTrack,
  readCompletedGuideTracks,
  type GuideTrackId,
} from "@/data/webGuideSteps";
import { cn } from "@/lib/utils";

export interface WebHelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartGuide: (trackId?: GuideTrackId) => void;
}

type HelpTab = "ACTIVE_MENU" | "ALL_MENUS" | "STATUS" | "SHORTCUT";

const STATUS_BADGES = [
  {
    label: "Hijau (Normal / Mengisi)",
    toneClass: "border-emerald/50 bg-emerald/15 text-emerald",
    desc: "Tegangan aki berada dalam batas aman atau sedang terisi alternator, dan unit terpantau aktif.",
  },
  {
    label: "Kuning (Perlu Dipantau / Standby)",
    toneClass: "border-amber/50 bg-amber/15 text-amber",
    desc: "Tegangan mendekati batas pemanasan atau unit sedang berada pada mode hemat daya (tidur).",
  },
  {
    label: "Merah (Kritis / Ada Kode DTC)",
    toneClass: "border-crimson/50 bg-crimson/15 text-crimson",
    desc: "Tegangan berada di bawah batas kritis yang diatur atau terdapat kode gangguan dari pembacaan ECU.",
  },
];

const SHORTCUTS = [
  {
    keys: "Ctrl + K / Cmd + K",
    desc: "Membuka Cari Cepat untuk melompat ke unit, lokasi bay, atau menu dashboard.",
  },
  {
    keys: "Alt + 1 s.d. Alt + 6",
    desc: "Berpindah langsung antara Menu 01 sampai Menu 06.",
  },
  {
    keys: "?",
    desc: "Membuka jendela Bantuan Web ini saat kursor tidak berada di kotak ketik.",
  },
  {
    keys: "Esc",
    desc: "Menutup dialog bantuan, Cari Cepat, atau panduan sorotan.",
  },
];

/**
 * Context-aware Web Help Center modal. Opens on the currently active module tab (`01`..`06`)
 * so users immediately see detailed guidance for the screen they are working on.
 */
export function WebHelpModal({ open, onClose, onStartGuide }: WebHelpModalProps) {
  const { activeModule, setActiveModule } = useTelemetry();
  const [tab, setTab] = useState<HelpTab>("ACTIVE_MENU");
  const [completedTracks, setCompletedTracks] = useState<GuideTrackId[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab("ACTIVE_MENU");
    setCompletedTracks(readCompletedGuideTracks());
  }, [open]);

  const activeTrack = getGuideTrack(activeModule);
  const isActiveTrackCompleted = completedTracks.includes(activeModule);

  const helpTabs: Array<{ id: HelpTab; label: string; Icon: typeof Layers }> = [
    { id: "ACTIVE_MENU", label: `Menu ${activeModule}`, Icon: Compass },
    { id: "ALL_MENUS", label: "Semua Menu", Icon: Layers },
    { id: "STATUS", label: "Mode & Warna", Icon: BookOpen },
    { id: "SHORTCUT", label: "Pintasan", Icon: Keyboard },
  ];

  const handleOpenModule = (id: ModuleId) => {
    setActiveModule(id);
    onClose();
  };

  const handleStartTrack = (trackId: GuideTrackId) => {
    onClose();
    onStartGuide(trackId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl rounded-[2px] border-border bg-card p-5 sm:p-6 text-foreground max-h-[90vh] flex flex-col shadow-none">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="font-display text-lg font-semibold tracking-tight text-foreground">
            Bantuan Penggunaan Web ORION
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            Panduan fungsi tiap menu di browser, arti warna indikator, dan pintasan keyboard.
          </DialogDescription>
        </DialogHeader>

        {/* Internal Help Section Tabs */}
        <div
          role="tablist"
          aria-label="Bagian bantuan penggunaan web"
          className="flex flex-wrap gap-1.5 border-b border-border pb-3"
        >
          {helpTabs.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`help-tab-${id}`}
                aria-selected={active}
                aria-controls={`help-panel-${id}`}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 num text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-foreground bg-foreground/12 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                )}
              >
                <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Tab Body */}
        <div
          role="tabpanel"
          id={`help-panel-${tab}`}
          aria-labelledby={`help-tab-${tab}`}
          className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3"
        >
          {tab === "ACTIVE_MENU" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-[2px] border border-border bg-secondary/50 p-3.5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      {activeTrack.title}
                    </h3>
                    {isActiveTrackCompleted && (
                      <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald/50 bg-emerald/15 px-1.5 py-0.5 num text-[11px] font-medium text-emerald">
                        <Check size={11} aria-hidden="true" />
                        Selesai
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {activeTrack.summary}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartTrack("overview")}
                  className="min-h-[44px] shrink-0 rounded-[2px] border-border bg-background text-xs text-foreground hover:bg-secondary cursor-pointer"
                >
                  Panduan Navigasi Bilah Atas
                </Button>
              </div>

              {/* 4 Concrete Steps for the Active Module */}
              <ol className="divide-y divide-border rounded-[2px] border border-border bg-secondary/35">
                {activeTrack.steps.map((step, idx) => (
                  <li key={step.id} className="flex items-start gap-3 p-3.5">
                    <span className="num mt-0.5 shrink-0 rounded-[2px] border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="font-display text-sm font-semibold text-foreground">
                        {step.title}
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                      <p className="text-xs leading-relaxed text-foreground/90">
                        <span className="num font-semibold text-amber mr-1">Tips:</span>
                        <span className="text-muted-foreground">{step.tip}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tab === "ALL_MENUS" && (
            <div className="divide-y divide-border rounded-[2px] border border-border bg-secondary/35">
              {WEB_GUIDE_TRACKS.map((track) => {
                const isDone = completedTracks.includes(track.id);
                const isCurrent = track.moduleId === activeModule;
                return (
                  <div
                    key={track.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold text-foreground">
                          {track.title}
                        </span>
                        {isCurrent && (
                          <span className="rounded-[2px] border border-foreground/50 bg-foreground/10 px-1.5 py-0.5 num text-[11px] text-foreground">
                            Aktif
                          </span>
                        )}
                        {isDone && (
                          <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald/50 bg-emerald/15 px-1.5 py-0.5 num text-[11px] text-emerald">
                            <Check size={11} aria-hidden="true" />
                            Selesai
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {track.summary}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {track.moduleId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModule(track.moduleId!)}
                          className="min-h-[44px] rounded-[2px] border-border bg-background text-xs text-foreground hover:bg-secondary cursor-pointer"
                        >
                          Buka
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleStartTrack(track.id)}
                        className="min-h-[44px] rounded-[2px] bg-secondary text-xs text-foreground border border-border hover:border-foreground/60 hover:bg-secondary/80 cursor-pointer"
                      >
                        Panduan ({track.steps.length})
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "STATUS" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Sumber Data di Bilah Atas
                </h3>
                <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                  <div className="rounded-[2px] border border-border bg-secondary/45 p-3">
                    <strong className="num text-xs text-foreground">MODE SIMULASI</strong>:
                    Menjalankan 12 unit contoh secara lokal di browser untuk mencoba seluruh
                    halaman, filter, dan tombol simulasi.
                  </div>
                  <div className="rounded-[2px] border border-border bg-secondary/45 p-3">
                    <strong className="num text-xs text-emerald">LIVE API</strong>: Mengambil data
                    aktual setiap 3 detik dari endpoint server MySQL yang dapat diatur lewat ikon
                    pengaturan di kanan atas.
                  </div>
                  <div className="rounded-[2px] border border-border bg-secondary/45 p-3">
                    <strong className="num text-xs text-amber">CACHE OFFLINE</strong>: Muncul
                    otomatis bila server Live API gagal dijangkau sementara; data lokal terakhir
                    tetap ditampilkan agar layar tidak kosong.
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Arti Warna Indikator
                </h3>
                <div className="space-y-2">
                  {STATUS_BADGES.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[2px] border border-border bg-secondary/45 p-3 space-y-1.5"
                    >
                      <span
                        className={cn(
                          "inline-block rounded-[2px] border px-2 py-0.5 num text-[11px] font-semibold",
                          item.toneClass,
                        )}
                      >
                        {item.label}
                      </span>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "SHORTCUT" && (
            <div className="space-y-3">
              <div className="space-y-2">
                {SHORTCUTS.map((sc) => (
                  <div
                    key={sc.keys}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[2px] border border-border bg-secondary/45 p-3"
                  >
                    <span className="text-[13px] text-muted-foreground">{sc.desc}</span>
                    <kbd className="w-fit shrink-0 rounded-[2px] border border-border bg-background px-2.5 py-1 num text-xs font-medium text-foreground">
                      {sc.keys}
                    </kbd>
                  </div>
                ))}
              </div>
              <div className="rounded-[2px] border border-border/80 bg-secondary/35 p-3 text-[13px] leading-relaxed text-muted-foreground">
                Pada perangkat desktop yang mendukung, tombol layar penuh tersedia di pojok kanan
                atas dashboard. Tombol Alarm Suara di bilah atas juga bisa diaktifkan jika ingin
                mendengar bunyi peringatan saat ada kondisi kritis.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border pt-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-[44px] rounded-[2px] border-border bg-background text-foreground hover:bg-secondary cursor-pointer"
          >
            Tutup
          </Button>
          <Button
            type="button"
            onClick={() => handleStartTrack(activeModule)}
            className="min-h-[44px] gap-2 rounded-[2px] bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
          >
            <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Panduan Sorotan Menu {activeModule} ({activeTrack.steps.length} Langkah)
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
