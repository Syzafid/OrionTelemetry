/**
 * Single Source of Truth (SSOT) for ORION PCB v2.0 Step 2.1 (S-D-G / Revisi 3).
 *
 * Update this registry first whenever a hardware revision advances (e.g. after bench
 * measurement of physical gates G1-G5 or electrical gates E1-E7), then mirror changes
 * into `docs/docs/hardware/pcb-v2-blueprint-layout.md` and `docs/static/img/pcb-v2-*.jpg`.
 */

export type GateStatus = "LULUS" | "SEBAGIAN" | "BELUM_DIUKUR" | "KONFIRMASI_FIRMWARE";

export interface BlueprintRevisionChange {
  component: string;
  previous: string;
  current: string;
}

export interface BlueprintPinMapping {
  pin: string;
  hole: string;
  net: string;
  note?: string;
}

export interface BlueprintComponentSpec {
  ref: string;
  part: string;
  mounting: string;
  optional?: boolean;
  keepOutArea?: string;
  pins: BlueprintPinMapping[];
  notes: string;
}

export interface BlueprintHeaderSlot {
  row: number;
  hole: string;
  signal: string;
  espGpio: string | null;
  net: string | null;
  active: boolean;
  note: string;
}

export interface BlueprintNetSpec {
  id: string;
  label: string;
  wireSpec: string;
  approxLengthMm: number | null;
  segments: string[];
  notes: string;
}

export interface BlueprintVerificationGate {
  id: string;
  kind: "FISIK" | "ELEKTRIKAL";
  subject: string;
  criteria: string;
  status: GateStatus;
  fallbackAction: string;
}

export const PCB_BLUEPRINT_META = {
  revisionCode: "PCB-v2.0-Step2.1-Rev3",
  title: "PCB ORION v2.0 - Step 2.1 (S-D-G)",
  status: "FINAL_BERSYARAT",
  boardSizeMm: {
    width: 70,
    height: 50,
  },
  grid: {
    cols: 24,
    rows: 18,
    pitchMm: 2.54,
    emptyCorners: ["c1r1", "c24r1", "c1r18", "c24r18"] as const,
  },
  verification: {
    totalNets: 22,
    totalSegments: 237,
    sharedHoleConflicts: 0,
    bottomCrossings: 0,
    topJumpers: 1,
    maxTopJumpers: 2,
    topJumperRef: "JV1",
    topJumperLengthMm: 40,
  },
  divider: {
    r1Ohm: 100000,
    r2Ohm: 27000,
    theoreticalRatio: 4.7037,
    defaultSlopeM: 0.0047037,
    defaultOffsetC: 0.16,
    referencePoint: { adcMv: 2517, vBat: 12.0 },
  },
  powerInput: {
    fuseRecommendedInitial: "500 mA time-lag",
    fuseMaxIfVerifiedAwg26: "1 A",
    diodePolarity: "1N5819 (Schottky)",
    tvsOptional: "P6KE18A (opsional di c3r15-c3r16; v1.0 pakai SMBJ15A)",
    shuntResistor: "R5 10 Ohm (c6r5-c6r4) diparalel header bypass JP (c7r5-c7r6)",
  },
  revisionMemo: {
    summary:
      "Q1 dan Q2 diurutkan S-D-G (Drain di tengah) memakai adaptor SOT-23 ke SIP-3 (pin 2-3-1 = S-D-G) tanpa kawat ekstensi. R3 dan R4 direbahkan mengangkangi dua lubang. Koordinat topologi dikunci; kelanjutan solder Tahap B menunggu gerbang fisik G1 dan G2.",
    changesFromStep2: [
      {
        component: "Q2",
        previous: "c3r6-c5r6, G-S-D (horizontal)",
        current: "c4r6-c4r8, S-D-G (vertikal; S di utara c4r6)",
      },
      {
        component: "R4",
        previous: "berdiri c3r7/c4r7",
        current: "rebah (flat), kaki c6r8 [G2] dan c6r6 [N12D]",
      },
      {
        component: "R1",
        previous: "c5r7/c5r8",
        current: "c7r7/c7r8 (100 kOhm vertikal)",
      },
      {
        component: "R6",
        previous: "c3r8/c3r9",
        current: "c4r9/c4r10 (27 kOhm vertikal)",
      },
      {
        component: "Q3",
        previous: "c3 r10-r12",
        current: "c4 r11-r13 (2N3904, sisi datar ke timur c5)",
      },
      {
        component: "R7 / R8",
        previous: "c4 r9-r10 / c4 r11-r12",
        current: "c5 r10-r11 / c5 r12-r13",
      },
      {
        component: "R5",
        previous: "c6r5/c6r6",
        current: "c6r5/c6r4 (10 Ohm vertikal)",
      },
      {
        component: "TVS (opsional)",
        previous: "c4r5 / c5r5",
        current: "c3r15 (K) / c3r16 (A), P6KE18A",
      },
      {
        component: "Q1",
        previous: "c19r8-c21r8, D-S-G",
        current: "c17r9-c19r9, S-D-G (D di c18r9)",
      },
      {
        component: "R3",
        previous: "berdiri c19r9/c20r9",
        current: "rebah (flat), kaki c20r8 [G1] dan c22r8 [V33A]",
      },
      {
        component: "C3",
        previous: "c17r5/c17r6",
        current: "c15r10 (GND) / c16r10 (V33CAN)",
      },
      {
        component: "JV1",
        previous: "c18r8 -> c18r14 -> c20r14",
        current: "c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14 (+/- 40 mm)",
      },
    ] satisfies BlueprintRevisionChange[],
    unchangedBlocks: [
      "J1",
      "D1",
      "JP",
      "U4 (MP1584)",
      "U3 soket WCMCU (c22 r2-r7)",
      "U2 (ZS-042 diputar 180 derajat)",
      "C1 & R2",
      "Header c23",
      "Busbar GND tepi (r1, c24, r18)",
    ],
    openItems: [
      "C2 100 uF tidak berada di PCB 70x50 mm; dipasang pada pin V/G ESP32 Base.",
      "Kawat +12V_D menuju pad TVS (c4r6->c3r7->c3r15, +/- 22 mm berisolasi) hanya dipasang bila P6KE18A ikut dirakit.",
      "C3 (100 nF) pada posisi c15r10/c16r10 berjarak kawat GND +/- 70 mm; opsi revisi tanpa ubah routing: solder 100 nF rebah di sisi bawah langsung melintasi c22r6-c22r7.",
      "Kupas ujung kabel pita OBD-II untuk mengukur AWG inti; pakai sekring 500 mA time-lag sampai inti terbukti >= 26 AWG (0.40 mm) sebelum naik ke 1 A.",
    ],
  },
} as const;

export const PCB_V2_COMPONENTS: BlueprintComponentSpec[] = [
  {
    ref: "J1",
    part: "Konektor 1x4 pitch 2.54 mm (JST-XH / KF2510)",
    mounting: "Tepi kiri kolom c2 r1-r4",
    pins: [
      { pin: "1 (W3)", hole: "c2r1", net: "GND" },
      { pin: "2 (W7)", hole: "c2r2", net: "CANL" },
      { pin: "3 (W4)", hole: "c2r3", net: "CANH" },
      { pin: "4 (W9)", hole: "c2r4", net: "V12F" },
    ],
    notes:
      "Slot CANL dan CANH ditempatkan terbalik dari draf awal agar WCMCU-230 180 derajat bebas persilangan.",
  },
  {
    ref: "D1",
    part: "1N5819 (Schottky Reverse Polarity)",
    mounting: "Berdiri vertikal c3 r4-r5",
    pins: [
      { pin: "A (Anoda)", hole: "c3r4", net: "V12F" },
      { pin: "K (Katoda/pita)", hole: "c3r5", net: "N12D" },
    ],
    notes: "Uji dioda awal ~0.15-0.35 V. Kaki 1N5822 terlalu tebal sehingga tidak dipakai.",
  },
  {
    ref: "TVS",
    part: "P6KE18A (Bidirectional/Unidirectional Clamp)",
    mounting: "Berdiri vertikal c3 r15-r16",
    optional: true,
    pins: [
      { pin: "K (Katoda/pita)", hole: "c3r15", net: "N12D" },
      { pin: "A (Anoda)", hole: "c3r16", net: "GND" },
    ],
    notes:
      "Opsional. Pad c3r16 selalu dilewati jalur GND untuk Q3.E dan R8.b meski TVS tidak dipasang.",
  },
  {
    ref: "R5",
    part: "Resistor Shunt 10 Ohm",
    mounting: "Berdiri vertikal c6 r4-r5",
    pins: [
      { pin: "a (+12V_D)", hole: "c6r5", net: "N12D" },
      { pin: "b (VIN)", hole: "c6r4", net: "VIN" },
    ],
    notes: "Mengukur arus tidur sistem lewat tegangan jatuh ketika jumper JP dilepas.",
  },
  {
    ref: "JP",
    part: "Header 2-pin + Jumper Bypass",
    mounting: "Berdiri vertikal c7 r5-r6",
    pins: [
      { pin: "a", hole: "c7r5", net: "N12D" },
      { pin: "b", hole: "c7r6", net: "VIN" },
    ],
    notes: "Jumper WAJIB terpasang saat operasi normal di kendaraan atau uji bench.",
  },
  {
    ref: "Q2",
    part: "AO3401A P-MOSFET pada Adaptor SOT-23 -> SIP-3 (2-3-1 = S-D-G)",
    mounting: "Solder langsung vertikal kolom c4 r6-r8 (S di utara)",
    keepOutArea: "3x3 (c3-c5 x r6-r8)",
    pins: [
      { pin: "S (Pin 2)", hole: "c4r6", net: "N12D" },
      { pin: "D (Pin 3)", hole: "c4r7", net: "QD" },
      { pin: "G (Pin 1)", hole: "c4r8", net: "G2" },
    ],
    notes: "Body diode uji dioda: merah di D (c4r7), hitam di S (c4r6) ~0.5 V; sebaliknya OL.",
  },
  {
    ref: "R4",
    part: "Resistor Pull-up 47 kOhm",
    mounting: "Rebah (flat) mengangkangi c6r6 dan c6r8",
    pins: [
      { pin: "b (+12V_D)", hole: "c6r6", net: "N12D" },
      { pin: "a (Gate Q2)", hole: "c6r8", net: "G2" },
    ],
    notes: "Lubang tengah c6r7 wajib kosong.",
  },
  {
    ref: "R1",
    part: "Resistor Divider Atas 100 kOhm",
    mounting: "Berdiri vertikal c7 r7-r8",
    pins: [
      { pin: "a (Drain Q2)", hole: "c7r7", net: "QD" },
      { pin: "b (Node M)", hole: "c7r8", net: "NODEM" },
    ],
    notes: "Dipasang terpisah di blok kiri sementara R2 dan C1 berada di sisi kanan dekat ADC_OUT.",
  },
  {
    ref: "R6",
    part: "Resistor Gate Limiter 27 kOhm",
    mounting: "Berdiri vertikal c4 r9-r10",
    pins: [
      { pin: "a (Gate Q2)", hole: "c4r9", net: "G2" },
      { pin: "b (Collector Q3)", hole: "c4r10", net: "QC" },
    ],
    notes:
      "Membentuk pembagi gate Q2 bersama R4 sehingga Vgs tetap -7.6 V (11.9 V) s/d -9.1 V (14.4 V), aman di bawah +/- 12 V.",
  },
  {
    ref: "Q3",
    part: "2N3904 NPN TO-92",
    mounting: "Kolom c4 r11-r13, sisi datar menghadap timur (ke c5)",
    pins: [
      { pin: "C (Collector)", hole: "c4r11", net: "QC" },
      { pin: "B (Base)", hole: "c4r12", net: "QB" },
      { pin: "E (Emitter)", hole: "c4r13", net: "GND" },
    ],
    notes: "Uji gerbang E7: gate Q2 terbaca ~4.4 V saat basis mendapat +3.3 V lewat R7 10k.",
  },
  {
    ref: "R7",
    part: "Resistor Basis 10 kOhm",
    mounting: "Berdiri vertikal c5 r10-r11",
    pins: [
      { pin: "b (ADC_TRIG)", hole: "c5r10", net: "ADCT" },
      { pin: "a (Base Q3)", hole: "c5r11", net: "QB" },
    ],
    notes: "Arus basis dari GPIO27 Active-HIGH.",
  },
  {
    ref: "R8",
    part: "Resistor Pull-down Basis 100 kOhm",
    mounting: "Berdiri vertikal c5 r12-r13",
    pins: [
      { pin: "a (Base Q3)", hole: "c5r12", net: "QB" },
      { pin: "b (GND)", hole: "c5r13", net: "GND" },
    ],
    notes: "Menjaga Q3 tetap OFF saat ESP32 Deep Sleep (pin mengambang / Hi-Z).",
  },
  {
    ref: "U4",
    part: "MP1584 Step-Down Buck 3.3V Fix",
    mounting: "4 pilar kawat tinggi 3-4 mm (tanpa diputar), area 9x6 lubang + Kapton tape di bawah",
    pins: [
      { pin: "IN-", hole: "c8r2", net: "GND" },
      { pin: "OUT-", hole: "c16r2", net: "GND" },
      { pin: "IN+", hole: "c8r7", net: "VIN" },
      { pin: "OUT+", hole: "c16r7", net: "V33A" },
    ],
    notes: "Bawah modul hanya boleh dilalui kawat tipis (jalur CAN_L dan CAN_H).",
  },
  {
    ref: "U3",
    part: "WCMCU-230 (SN65HVD230) CAN Transceiver",
    mounting:
      "Diputar 180 derajat pada soket 1x6 tinggi 8.5 mm di c22 r2-r7 + 2 pilar non-konduktif (c17r2, c19r7)",
    pins: [
      { pin: "CANL", hole: "c22r2", net: "CANL" },
      { pin: "CANH", hole: "c22r3", net: "CANH" },
      { pin: "CRX", hole: "c22r4", net: "CRX" },
      { pin: "CTX", hole: "c22r5", net: "CTX" },
      { pin: "GND", hole: "c22r6", net: "GND" },
      { pin: "3V3", hole: "c22r7", net: "V33CAN" },
    ],
    notes: "Batas tepi bawah modul r1.55-r7.45 bersifat asumsi; wajib lolos gerbang G1 dan G2.",
  },
  {
    ref: "Q1",
    part: "AO3401A P-MOSFET pada Adaptor SOT-23 -> SIP-3 (2-3-1 = S-D-G)",
    mounting: "Solder langsung horizontal baris r9 (c17-c19, S di barat)",
    keepOutArea: "3x3 (c17-c19 x r8-r10)",
    pins: [
      { pin: "S (Pin 2)", hole: "c17r9", net: "V33A" },
      { pin: "D (Pin 3)", hole: "c18r9", net: "V33CAN" },
      { pin: "G (Pin 1)", hole: "c19r9", net: "G1" },
    ],
    notes: "Sakelar 3V3_CAN aktif-LOW dari GPIO26.",
  },
  {
    ref: "R3",
    part: "Resistor Pull-up 47 kOhm",
    mounting: "Rebah (flat) mengangkangi c20r8 dan c22r8",
    pins: [
      { pin: "a (Gate Q1 / CAN_EN)", hole: "c20r8", net: "G1" },
      { pin: "b (3V3_MAIN)", hole: "c22r8", net: "V33A" },
    ],
    notes: "Lubang tengah c21r8 wajib kosong. Menjaga transceiver CAN mati saat Deep Sleep.",
  },
  {
    ref: "C3",
    part: "Kapasitor Keramik 100 nF",
    mounting: "Berdiri horizontal c15r10-c16r10",
    pins: [
      { pin: "b (GND)", hole: "c15r10", net: "GND" },
      { pin: "a (3V3_CAN)", hole: "c16r10", net: "V33CAN" },
    ],
    notes:
      "Alternatif tanpa ubah routing: solder 100 nF rebah di sisi bawah langsung di c22r6-c22r7.",
  },
  {
    ref: "C1",
    part: "Kapasitor Filter ADC 100 nF",
    mounting: "Berdiri vertikal c20 r10-r11",
    pins: [
      { pin: "b (GND)", hole: "c20r10", net: "GND" },
      { pin: "a (Node M)", hole: "c20r11", net: "NODEM" },
    ],
    notes: "Tinggi aman di bawah tepi ZS-042; membutuhkan settling 40 ms sebelum 16x sampling.",
  },
  {
    ref: "R2",
    part: "Resistor Divider Bawah 27 kOhm (1/8 W)",
    mounting: "Berdiri vertikal c22 r10-r11",
    pins: [
      { pin: "b (GND)", hole: "c22r10", net: "GND" },
      { pin: "a (Node M)", hole: "c22r11", net: "NODEM" },
    ],
    notes: "Wajib ukuran fisik 1/8 W agar tidak menekan selubung konektor Dupont header c23.",
  },
  {
    ref: "U2",
    part: "Modul RTC ZS-042 (DS3231SN + CR2032)",
    mounting:
      "Diputar 180 derajat pada soket 8.5 mm (baterai menghadap atas); LED POWER & charger dilepas",
    pins: [
      { pin: "GND (6-pin)", hole: "c7r12", net: "GND", note: "Pad mati penopang mekanis" },
      { pin: "VCC (6-pin)", hole: "c7r13", net: "V33B", note: "Pad mati penopang mekanis" },
      { pin: "SDA (6-pin)", hole: "c7r14", net: "SDA", note: "Pad mati penopang mekanis" },
      { pin: "SCL (6-pin)", hole: "c7r15", net: "SCL", note: "Pad mati penopang mekanis" },
      { pin: "SQW (6-pin)", hole: "c7r16", net: "SQW", note: "Aktif -> GPIO32" },
      { pin: "32K (6-pin)", hole: "c7r17", net: "K32", note: "Pad mati penopang mekanis" },
      { pin: "GND (4-pin)", hole: "c21r13", net: "GND", note: "Aktif" },
      { pin: "VCC (4-pin)", hole: "c21r14", net: "V33B", note: "Aktif via JV1" },
      { pin: "SDA (4-pin)", hole: "c21r15", net: "SDA", note: "Aktif -> GPIO21" },
      { pin: "SCL (4-pin)", hole: "c21r16", net: "SCL", note: "Aktif -> GPIO22" },
    ],
    notes:
      "Lepas LED indikator & rangkaian pengisi (dioda/resistor) sebelum dipasang agar aman untuk sel CR2032.",
  },
  {
    ref: "H",
    part: "Header Male 1x14 (Pin r7 dan r9 dicabut -> 12 pin aktif)",
    mounting: "Kolom c23 baris r4-r17",
    pins: [
      { pin: "CRX", hole: "c23r4", net: "CRX" },
      { pin: "CTX", hole: "c23r5", net: "CTX" },
      { pin: "GND1", hole: "c23r6", net: "GND" },
      { pin: "CAN_EN", hole: "c23r8", net: "G1" },
      { pin: "GND3", hole: "c23r10", net: "GND" },
      { pin: "ADC_OUT", hole: "c23r11", net: "NODEM" },
      { pin: "ADC_TRIG", hole: "c23r12", net: "ADCT" },
      { pin: "GND2", hole: "c23r13", net: "GND" },
      { pin: "3V3", hole: "c23r14", net: "V33B" },
      { pin: "SDA", hole: "c23r15", net: "SDA" },
      { pin: "SCL", hole: "c23r16", net: "SCL" },
      { pin: "RTC_INT", hole: "c23r17", net: "SQW" },
    ],
    notes:
      "Gunakan konektor Dupont multi-way rata atau terminal female ber-heat-shrink; jangan menekuk pin.",
  },
  {
    ref: "JV1",
    part: "Jumper Atas Tunggal (Kawat tunggal 26 AWG berisolasi, +/- 40 mm)",
    mounting: "Sisi atas papan: c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14",
    pins: [
      { pin: "Pangkal (V33A)", hole: "c16r8", net: "V33A" },
      { pin: "Ujung (V33B)", hole: "c22r14", net: "V33B" },
    ],
    notes: "Pasang kedua ujung SEBELUM jalur bawah di lubang c16r8 dan c22r14 disolder.",
  },
];

export const PCB_V2_HEADER_PINS: BlueprintHeaderSlot[] = [
  {
    row: 4,
    hole: "c23r4",
    signal: "CRX",
    espGpio: "GPIO4",
    net: "CRX",
    active: true,
    note: "TWAI RX dari U3",
  },
  {
    row: 5,
    hole: "c23r5",
    signal: "CTX",
    espGpio: "GPIO5",
    net: "CTX",
    active: true,
    note: "TWAI TX ke U3",
  },
  {
    row: 6,
    hole: "c23r6",
    signal: "GND1",
    espGpio: "GND",
    net: "GND",
    active: true,
    note: "Return referensi",
  },
  {
    row: 7,
    hole: "c23r7",
    signal: "DICABUT",
    espGpio: null,
    net: null,
    active: false,
    note: "Pin dicabut (celah poka-yoke)",
  },
  {
    row: 8,
    hole: "c23r8",
    signal: "CAN_EN",
    espGpio: "GPIO26",
    net: "G1",
    active: true,
    note: "Active-LOW Gate Q1",
  },
  {
    row: 9,
    hole: "c23r9",
    signal: "DICABUT",
    espGpio: null,
    net: null,
    active: false,
    note: "Pin dicabut (celah poka-yoke)",
  },
  {
    row: 10,
    hole: "c23r10",
    signal: "GND3",
    espGpio: "GND",
    net: "GND",
    active: true,
    note: "Return filter C1 & R2",
  },
  {
    row: 11,
    hole: "c23r11",
    signal: "ADC_OUT",
    espGpio: "GPIO34",
    net: "NODEM",
    active: true,
    note: "ADC1_CH6 Node M",
  },
  {
    row: 12,
    hole: "c23r12",
    signal: "ADC_TRIG",
    espGpio: "GPIO27",
    net: "ADCT",
    active: true,
    note: "Active-HIGH Pulsa 40 ms",
  },
  {
    row: 13,
    hole: "c23r13",
    signal: "GND2",
    espGpio: "GND",
    net: "GND",
    active: true,
    note: "Return RTC/ESP32",
  },
  {
    row: 14,
    hole: "c23r14",
    signal: "3V3",
    espGpio: "3V3",
    net: "V33B",
    active: true,
    note: "Suplai 3.3V dari JV1",
  },
  {
    row: 15,
    hole: "c23r15",
    signal: "SDA",
    espGpio: "GPIO21",
    net: "SDA",
    active: true,
    note: "I2C SDA DS3231SN",
  },
  {
    row: 16,
    hole: "c23r16",
    signal: "SCL",
    espGpio: "GPIO22",
    net: "SCL",
    active: true,
    note: "I2C SCL DS3231SN",
  },
  {
    row: 17,
    hole: "c23r17",
    signal: "RTC_INT",
    espGpio: "GPIO32",
    net: "SQW",
    active: true,
    note: "Wakeup IRQ Active-LOW",
  },
];

export const PCB_V2_NETS: BlueprintNetSpec[] = [
  {
    id: "GND",
    label: "GND (Busbar Cincin + Cabang)",
    wireSpec: "22 AWG polos (r1/c24), 24 AWG (r18/riser c2), 30 AWG (cabang)",
    approxLengthMm: 239,
    segments: [
      "c2r1->c23r1 (H)",
      "c23r1->c24r2 (D)",
      "c24r2->c24r17 (V)",
      "c24r17->c23r18 (D)",
      "c23r18->c2r18 (H)",
      "c2r18->c2r16 (V)",
      "c2r16->c3r16 (H)",
      "c8r1->c8r2 (V)",
      "c16r1->c16r2 (V)",
      "c24r6->c22r6 (H)",
      "c24r10->c20r10 (H)",
      "c24r13->c21r13 (H)",
      "c4r15->c4r13 (V)",
      "c3r16->c4r15 (D)",
      "c4r13->c5r13 (H)",
      "c14r9->c15r10 (D)",
      "c14r7->c14r9 (V)",
      "c16r5->c14r7 (D)",
      "c21r5->c16r5 (H)",
      "c22r6->c21r5 (D)",
    ],
    notes: "Arus balik utama dari H.GND mengalir melalui cincin c24 lalu busbar atas r1 ke J1.1.",
  },
  {
    id: "V12F",
    label: "+12V_F (Setelah Sekring, Sebelum D1)",
    wireSpec: "26 AWG berisolasi",
    approxLengthMm: 3,
    segments: ["c2r4->c3r4 (H)"],
    notes: "Masuk dari J1.4 (+12V_F / W9) ke Anoda D1.",
  },
  {
    id: "N12D",
    label: "+12V_D (Setelah D1 1N5819)",
    wireSpec: "26 AWG berisolasi",
    approxLengthMm: 13,
    segments: ["c3r5->c4r6 (D)", "c4r6->c6r6 (H)", "c6r6->c6r5 (V)", "c6r5->c7r5 (H)"],
    notes: "Cabang opsional TVS P6KE18A: c4r6->c3r7 (D) ; c3r7->c3r15 (V) (+/- 22 mm berisolasi).",
  },
  {
    id: "VIN",
    label: "VIN (Setelah R5/JP -> MP1584 IN+)",
    wireSpec: "26 AWG berisolasi",
    approxLengthMm: 13,
    segments: ["c8r7->c7r6 (D)", "c7r4->c6r4 (H)", "c8r5->c7r4 (D)", "c7r6->c8r5 (D)"],
    notes: "Menghubungkan keluaran R5/JP langsung ke IN+ MP1584.",
  },
  {
    id: "V33A",
    label: "3V3_MAIN (Sisi MP1584 OUT+, Q1.S, R3.b)",
    wireSpec: "26 AWG berisolasi",
    approxLengthMm: 27,
    segments: [
      "c16r8->c17r9 (D)",
      "c16r7->c16r8 (V)",
      "c21r7->c22r8 (D)",
      "c20r7->c21r7 (H)",
      "c19r8->c20r7 (D)",
      "c18r8->c19r8 (H)",
      "c17r9->c18r8 (D)",
    ],
    notes: "Disambungkan ke V33B di sisi RTC/ESP32 melalui jumper atas JV1 pada c16r8 -> c22r14.",
  },
  {
    id: "V33B",
    label: "3V3_MAIN Sisi RTC & Header (Disuplai JV1)",
    wireSpec: "26 AWG berisolasi",
    approxLengthMm: 5,
    segments: ["c21r14->c23r14 (H)"],
    notes: "Ujung kedua JV1 masuk di lubang c22r14 (di antara c21r14 dan c23r14).",
  },
  {
    id: "V33CAN",
    label: "3V3_CAN (Switched Drain Q1 -> U3.3V3 & C3)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 35,
    segments: [
      "c15r9->c16r10 (D)",
      "c15r7->c15r9 (V)",
      "c16r6->c15r7 (D)",
      "c21r6->c16r6 (H)",
      "c22r7->c21r6 (D)",
      "c17r10->c18r9 (D)",
      "c16r10->c17r10 (H)",
    ],
    notes: "Diputus ke 0 V saat GPIO26 HIGH (sleep mode).",
  },
  {
    id: "CANL",
    label: "CAN_L (J1.2 -> U3.CANL)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 52,
    segments: ["c21r3->c22r2 (D)", "c8r3->c21r3 (H)", "c7r2->c8r3 (D)", "c2r2->c7r2 (H)"],
    notes: "Melintas datar di bawah modul MP1584.",
  },
  {
    id: "CANH",
    label: "CAN_H (J1.3 -> U3.CANH)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 52,
    segments: ["c21r4->c22r3 (D)", "c8r4->c21r4 (H)", "c7r3->c8r4 (D)", "c2r3->c7r3 (H)"],
    notes: "Berpasangan sejajar CAN_L melintas di bawah MP1584.",
  },
  {
    id: "CRX",
    label: "CRX (U3.CRX -> H.CRX GPIO4)",
    wireSpec: "30 AWG / jembatan solder",
    approxLengthMm: 3,
    segments: ["c22r4->c23r4 (H)"],
    notes: "Jembatan pendek 1 pitch ke Header c23r4.",
  },
  {
    id: "CTX",
    label: "CTX (U3.CTX -> H.CTX GPIO5)",
    wireSpec: "30 AWG / jembatan solder",
    approxLengthMm: 3,
    segments: ["c22r5->c23r5 (H)"],
    notes: "Jembatan pendek 1 pitch ke Header c23r5.",
  },
  {
    id: "SDA",
    label: "SDA (U2.SDA4 -> H.SDA GPIO21)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 5,
    segments: ["c21r15->c23r15 (H)"],
    notes: "I2C bus DS3231SN.",
  },
  {
    id: "SCL",
    label: "SCL (U2.SCL4 -> H.SCL GPIO22)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 5,
    segments: ["c21r16->c23r16 (H)"],
    notes: "I2C clock DS3231SN.",
  },
  {
    id: "SQW",
    label: "RTC_INT / SQW (U2.SQW -> H.RTC_INT GPIO32)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 42,
    segments: ["c21r17->c23r17 (H)", "c20r16->c21r17 (D)", "c7r16->c20r16 (H)"],
    notes: "Mengambil SQW dari sisi kiri 6-pin ZS-042 (c7r16).",
  },
  {
    id: "G1",
    label: "CAN_EN (H.CAN_EN GPIO26 -> R3.a -> Q1.G)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 14,
    segments: ["c21r9->c20r8 (D)", "c22r9->c21r9 (H)", "c23r8->c22r9 (D)", "c20r8->c19r9 (D)"],
    notes: "Active-LOW kontrol gate Q1.",
  },
  {
    id: "G2",
    label: "Gate Q2 (Q2.G -> R4.a & R6.a)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 8,
    segments: ["c4r8->c4r9 (V)", "c4r8->c6r8 (H)"],
    notes: "Titik uji tegangan gate E2/E7.",
  },
  {
    id: "QD",
    label: "Drain Q2 (Q2.D -> R1.a)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 8,
    segments: ["c4r7->c7r7 (H)"],
    notes: "Terputus dari aki (+12V_D) saat Q2 OFF.",
  },
  {
    id: "QC",
    label: "Collector Q3 (R6.b -> Q3.C)",
    wireSpec: "30 AWG / jembatan solder",
    approxLengthMm: 3,
    segments: ["c4r10->c4r11 (V)"],
    notes: "Penghubung 2N3904 ke pembatas arus gate R6.",
  },
  {
    id: "QB",
    label: "Base Q3 (Q3.B -> R7.a -> R8.a)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 5,
    segments: ["c4r12->c5r12 (H)", "c5r12->c5r11 (V)"],
    notes: "Simpul pembagi bias basis NPN.",
  },
  {
    id: "ADCT",
    label: "ADC_TRIG (H.ADC_TRIG GPIO27 -> R7.b)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 47,
    segments: ["c6r11->c5r10 (D)", "c7r11->c6r11 (H)", "c8r12->c7r11 (D)", "c23r12->c8r12 (H)"],
    notes: "Jalur pemicu pulsa 40 ms.",
  },
  {
    id: "NODEM",
    label: "Node M / ADC_OUT (R1.b -> C1.a -> R2.a -> H.ADC_OUT GPIO34)",
    wireSpec: "30 AWG Kynar/PVC",
    approxLengthMm: 43,
    segments: ["c10r11->c23r11 (H)", "c10r11->c7r8 (D)"],
    notes: "Melintas di bawah ZS-042 menuju C1/R2 di sisi kanan.",
  },
  {
    id: "K32",
    label: "Pad Mati U2.32K (Tanpa Jalur)",
    wireSpec: "Tanpa kawat (solder penopang mekanis)",
    approxLengthMm: 0,
    segments: [],
    notes:
      "Pin 32K ZS-042 (c7r17) dan empat pin kiri c7r12..c7r15 dibiarkan mati dan disolder sebagai penopang soket.",
  },
];

export const PCB_PHYSICAL_GATES: BlueprintVerificationGate[] = [
  {
    id: "G1",
    kind: "FISIK",
    subject: "Margin posisi pin WCMCU-230 ke tepi bawah modul",
    criteria: "Margin pin ke tepi bawah >= 1.1 mm (badan berakhir <= r7.45)",
    status: "BELUM_DIUKUR",
    fallbackAction: "Geser Q1 (blok r8-r10) agar tidak bersentuhan dengan tepi WCMCU-230.",
  },
  {
    id: "G2",
    kind: "FISIK",
    subject: "Dry-fit soket 1x6 WCMCU (c22) vs selubung Dupont Header (c23)",
    criteria: "Tidak saling menekan pada jarak 1 pitch (2.54 mm); lebar selubung <= 2.54 mm",
    status: "BELUM_DIUKUR",
    fallbackAction: "Geser U3 dan R2 ke kolom c21 (re-route).",
  },
  {
    id: "G3",
    kind: "FISIK",
    subject: "Adaptor SOT-23 ke SIP-3 (2-3-1 = S-D-G)",
    criteria: "Kontinuitas 2-3-1 ke S-D-G dan tinggi terpasang < 6 mm",
    status: "LULUS",
    fallbackAction: "Selesai terkonfirmasi; langsung disolder vertikal (Q2) dan horizontal (Q1).",
  },
  {
    id: "G4",
    kind: "FISIK",
    subject: "Tinggi komponen MP1584 di 2.5 mm terakhir tepi kanan",
    criteria: "Celah ke dasar WCMCU (soket 8.5 mm) >= 1 mm bila tumpang tindih",
    status: "BELUM_DIUKUR",
    fallbackAction: "Wajib diukur hanya apabila G2 gagal.",
  },
  {
    id: "G5",
    kind: "FISIK",
    subject: "Ukuran papan adaptor (P x L) dan posisi baris pin",
    criteria: "<= 7.6 x 7.6 mm dengan baris pin di tengah blok keep-out 3x3",
    status: "BELUM_DIUKUR",
    fallbackAction: "Perbesar blok keep-out (re-route kecil).",
  },
];

export const PCB_ELECTRICAL_GATES: BlueprintVerificationGate[] = [
  {
    id: "E1",
    kind: "ELEKTRIKAL",
    subject: "Output MP1584 tanpa beban",
    criteria: "Stabil 3.2-3.4 V pada input 11.91 V, 12.6 V, dan +/- 14 V",
    status: "SEBAGIAN",
    fallbackAction: "Lulus 3.33 V di input 3S 11.91 V; ulangi di 12.6 V dan +/- 14 V (PSU).",
  },
  {
    id: "E2",
    kind: "ELEKTRIKAL",
    subject: "Sakelar ADC Q2/Q3 + pembagi tegangan R1/R2",
    criteria: "OFF Node M = 0.00 V; ON Vgs diharapkan ~ -7.6 V (11.9 V) s/d -9.1 V (14.4 V)",
    status: "BELUM_DIUKUR",
    fallbackAction: "Ukur ulang Vgs Q2 ON/OFF pada prototipe PCB v2.0 Step 2.1.",
  },
  {
    id: "E3",
    kind: "ELEKTRIKAL",
    subject: "Sakelar CAN Q1 (GPIO26 Active-LOW)",
    criteria: "OFF = 0.00 V, ON = 3.33 V pada rel 3V3_CAN",
    status: "LULUS",
    fallbackAction: "Terverifikasi sesuai logika firmware Active-LOW.",
  },
  {
    id: "E4",
    kind: "ELEKTRIKAL",
    subject: "Polaritas GPIO27 (ADC_TRIG)",
    criteria: "Perangkat keras Active-HIGH cocok dengan definisi firmware",
    status: "LULUS",
    fallbackAction:
      "Terkonfirmasi Active-HIGH pada PIN_GATE_ADC (GPIO 27) di sketch_oct16aa.ino v1.6.0.",
  },
  {
    id: "E5",
    kind: "ELEKTRIKAL",
    subject: "Arus tidur DevKit + Base via shunt R5 (10 Ohm) / JP dibuka",
    criteria: "Arus tidur gabungan < 500 uA",
    status: "BELUM_DIUKUR",
    fallbackAction: "Ukur setelah Tahap C dengan ZS-042 sudah dimodifikasi.",
  },
  {
    id: "E6",
    kind: "ELEKTRIKAL",
    subject: "Uji dioda D1 dan polaritas TVS P6KE18A",
    criteria: "Drop forward 1N5819 ~0.15-0.35 V; arah pita katoda terkonfirmasi",
    status: "BELUM_DIUKUR",
    fallbackAction: "Wajib lulus di Tahap 0 poin 3 sebelum menyolder blok kiri.",
  },
  {
    id: "E7",
    kind: "ELEKTRIKAL",
    subject: "Uji fungsi Q3 (2N3904) + pembagi gate R4/R6 di breadboard",
    criteria: "Titik G ~ 4.4 V saat basis mendapat 3.3 V dan ~ 12 V saat basis ke GND",
    status: "BELUM_DIUKUR",
    fallbackAction: "Wajib lulus sebelum Q3 disolder di Tahap A.",
  },
];
