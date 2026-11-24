import { useState } from "react";
import { ArrowRight, BookOpen, Compass, Keyboard, Layers } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface WebHelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartGuide: () => void;
}

type HelpTab = "MENU" | "STATUS" | "SHORTCUT";

const HELP_TABS: Array<{ id: HelpTab; label: string; Icon: typeof Layers }> = [
  { id: "MENU", label: "Menu Dashboard", Icon: Layers },
  { id: "STATUS", label: "Mode & Warna", Icon: BookOpen },
  { id: "SHORTCUT", label: "Pintasan", Icon: Keyboard },
];

const MODULE_SUMMARIES: Array<{ id: ModuleId; name: string; desc: string }> = [
  {
    id: "01",
    name: "Topologi & Transduser",
    desc: "Pilih unit kendaraan di sidebar kiri dan klik komponen pada gambar untuk memeriksa rincian nilai sensor.",
  },
  {
    id: "02",
    name: "Armada & PDI",
    desc: "Saring unit berdasarkan kondisi aki, urutkan prioritas, buka sertifikat PDI, dan ekspor laporan Excel.",
  },
  {
    id: "03",
    name: "Antrean Pemanasan",
    desc: "Catat jadwal pemanasan mesin dan pantau timer pemanasan 10 menit beserta riwayat sesinya.",
  },
  {
    id: "04",
    name: "OBD-II Diagnostik",
    desc: "Pantau indikator RPM, suhu pendingin, daftar kode gangguan (DTC mode baca saja), dan grafik tren.",
  },
  {
    id: "05",
    name: "Presensi & Log",
    desc: "Lihat catatan kendaraan keluar-masuk area gudang serta status antrean data yang tersimpan offline.",
  },
  {
    id: "06",
    name: "Konfigurasi Node",
    desc: "Daftarkan unit baru, atur batas tegangan dan kalibrasi di web, serta kelola tiket dan log aktivitas.",
  },
];

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
    desc: "Menutup dialog bantuan, Cari Cepat, atau panduan interaktif.",
  },
];

/**
 * Web-only Help Center modal covering dashboard menus, data modes, color meanings,
 * keyboard shortcuts, and entry point to the 8-step interactive web guide.
 */
export function WebHelpModal({ open, onClose, onStartGuide }: WebHelpModalProps) {
  const { setActiveModule } = useTelemetry();
  const [tab, setTab] = useState<HelpTab>("MENU");

  const handleOpenModule = (id: ModuleId) => {
    setActiveModule(id);
    onClose();
  };

  const handleLaunchGuide = () => {
    onClose();
    onStartGuide();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl rounded-[2px] border-border bg-card p-5 sm:p-6 text-foreground max-h-[90vh] flex flex-col">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display text-lg font-semibold tracking-tight text-foreground">
            Bantuan Penggunaan Web ORION
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            Ringkasan fitur antarmuka dashboard, arti indikator warna, dan pintasan navigasi di
            browser.
          </DialogDescription>
        </DialogHeader>

        {/* Internal Help Section Tabs */}
        <div
          role="tablist"
          aria-label="Bagian bantuan penggunaan web"
          className="flex flex-wrap gap-1.5 border-b border-border pb-3"
        >
          {HELP_TABS.map(({ id, label, Icon }) => {
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
                  "inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 num text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          {tab === "MENU" && (
            <div className="space-y-2">
              {MODULE_SUMMARIES.map((mod) => (
                <div
                  key={mod.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[2px] border border-border bg-secondary/45 p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="num text-xs font-semibold text-foreground">{mod.id}</span>
                      <span className="font-display text-sm font-semibold text-foreground">
                        {mod.name}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{mod.desc}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenModule(mod.id)}
                    className="min-h-[38px] shrink-0 rounded-[2px] border-border bg-background text-xs text-foreground hover:bg-secondary cursor-pointer"
                  >
                    Buka
                  </Button>
                </div>
              ))}
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
            onClick={handleLaunchGuide}
            className="min-h-[44px] gap-2 rounded-[2px] bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
          >
            <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Mulai Panduan Interaktif (8 Langkah)</span>
            <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
