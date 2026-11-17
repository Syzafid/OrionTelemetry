#!/usr/bin/env python3
"""
Simulasi Pengujian Firmware TASK 1.4:
- Part A: Urutan transisi zona (EXIT DISAHKAN -> WIFI ASYNC CONNECT mulai -> Terhubung -> ZONE TRANSITION -> TECH_HOTSPOT)
- Part B: Kalkulasi pendingFirstMissEpoch deferred lag calculation pada paket pertama zona luar
- Part C: Anti-flapping di gerbang pada Zero-Scan Yard Hold
"""

NET_ZONE_UNKNOWN = 0
NET_ZONE_YARD    = 1
NET_ZONE_TECH    = 2
NET_ZONE_OFFLINE = 3

def zone_str(z):
    return {0: "UNKNOWN", 1: "YARD", 2: "TECH_HOTSPOT", 3: "OFFLINE"}.get(z, "UNKNOWN")

class OrionFirmwareSim:
    def __init__(self):
        self.rtcCurrentZone = NET_ZONE_YARD
        self.rtcYardMissCount = 0
        self.rtcYardHitCount = 0
        self.rtcFirstMissEpoch = 0
        self.pendingFirstMissEpoch = 0
        self.yardRecoveryCount = 0
        self.wifiConnState = "CONN_IDLE"
        self.wifiStatus = "WL_CONNECTED"
        self.wifiSsid = "DIPO Ruijie"
        self.wifiRssi = -65
        self.wifiTechSsid = "POCOF5"
        self.wifiYardSsid = "DIPO Ruijie"

    def setZone(self, newZone, reason=""):
        if self.rtcCurrentZone == newZone:
            return
        oldZone = self.rtcCurrentZone
        self.rtcCurrentZone = newZone
        oldStr = zone_str(oldZone)
        newStr = zone_str(newZone)
        rStr = f" | {reason}" if reason else ""
        if oldZone == NET_ZONE_YARD and newZone == NET_ZONE_OFFLINE:
            print(f"[ZONE TRANSITION] YARD -> OFFLINE{rStr}")
        elif oldZone == NET_ZONE_YARD and newZone == NET_ZONE_TECH:
            print(f"[ZONE TRANSITION] YARD -> TECH_HOTSPOT{rStr}")
        elif (oldZone == NET_ZONE_TECH or oldZone == NET_ZONE_OFFLINE) and newZone == NET_ZONE_YARD:
            print(f"[ZONE TRANSITION] OUTSIDE -> YARD{rStr}")
        elif oldZone == NET_ZONE_TECH and newZone == NET_ZONE_OFFLINE:
            print(f"[ZONE TRANSITION] TECH_HOTSPOT -> OFFLINE{rStr}")
        elif oldZone == NET_ZONE_OFFLINE and newZone == NET_ZONE_TECH:
            print(f"[ZONE TRANSITION] OFFLINE -> TECH_HOTSPOT{rStr}")
        else:
            print(f"[ZONE TRANSITION] {oldStr} -> {newStr}{rStr}")

    def evaluateNetworkZone(self, ts_epoch, speed_kmh):
        # 1. Stale miss check
        if self.rtcFirstMissEpoch > 0 and ts_epoch > self.rtcFirstMissEpoch and (ts_epoch - self.rtcFirstMissEpoch) > 620:
            self.rtcYardMissCount = 0
            self.rtcFirstMissEpoch = 0
            self.yardRecoveryCount = 0
            print("[ZONE] Stale miss counter reset (>620s expired)")

        # 2. Zero-scan yard hold with Gate Anti-Flapping
        if self.wifiStatus == "WL_CONNECTED" and self.wifiSsid == self.wifiYardSsid and self.wifiRssi >= -85:
            if self.rtcYardMissCount > 0:
                print(f"[ZERO-SCAN HOLD] Anti-flapping aktif (missCount={self.rtcYardMissCount}, recoveryScan={self.yardRecoveryCount}/2). Debounce miss dipertahankan.")
                self.setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (Anti-Flap Holding)")
                return NET_ZONE_YARD, 0
            self.setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (Evaluate)")
            self.rtcYardHitCount = 0
            return NET_ZONE_YARD, 0

        # 3. Zone from background scan & deferred lag calculation
        outZone = self.rtcCurrentZone if self.rtcCurrentZone != NET_ZONE_UNKNOWN else NET_ZONE_OFFLINE
        outLagSteps = 0
        if self.pendingFirstMissEpoch > 0 and (outZone == NET_ZONE_OFFLINE or outZone == NET_ZONE_TECH):
            lagSec = ts_epoch - self.pendingFirstMissEpoch if ts_epoch > self.pendingFirstMissEpoch else 0
            if lagSec > 620:
                outLagSteps = 0
            else:
                steps = lagSec // 20
                outLagSteps = 31 if steps > 31 else steps
            print(f"[ZONE LAG PACK] ts_epoch={ts_epoch} pendingFirstMissEpoch={self.pendingFirstMissEpoch} -> lagSec={lagSec}s steps={outLagSteps}")
            self.pendingFirstMissEpoch = 0
        return outZone, outLagSteps

    def triggerWifiScanIfDue(self):
        if self.wifiStatus == "WL_CONNECTED" and self.wifiSsid == self.wifiYardSsid and self.wifiRssi >= -85:
            if self.rtcYardMissCount == 0:
                self.setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (TriggerScan)")
                self.rtcYardHitCount = 0
                return False
        return True

    def scanCompleteCallback(self, scanFinishedEpoch, yardRssi, techRssi, lastKnownSpeed):
        if self.rtcCurrentZone == NET_ZONE_YARD:
            if yardRssi >= -85:
                if self.rtcYardMissCount > 0:
                    self.yardRecoveryCount += 1
                    if self.yardRecoveryCount < 2:
                        print(f"[GATE ANTI-FLAP] Yard sinyal terdeteksi lagi (#{self.yardRecoveryCount}/2). Debounce miss count ({self.rtcYardMissCount}) dipertahankan.")
                        return
                    print("[GATE ANTI-FLAP] Pemulihan sinyal gudang stabil (>=2 scan). Reset miss counter.")
                self.rtcYardMissCount = 0
                self.rtcFirstMissEpoch = 0
                self.yardRecoveryCount = 0
                return

            # Debounce keluar
            self.yardRecoveryCount = 0
            self.rtcYardMissCount += 1
            if self.rtcYardMissCount == 1:
                self.rtcFirstMissEpoch = scanFinishedEpoch
            exitConfirmed = (self.rtcYardMissCount >= 3) or (self.rtcYardMissCount >= 2 and lastKnownSpeed > 0)
            print(f"[ZONE DEBOUNCE] Yard SSID miss #{self.rtcYardMissCount}/3 (firstMissEpoch={self.rtcFirstMissEpoch}, RSSI={yardRssi} dBm, speed={lastKnownSpeed} km/h) -> {'EXIT DISAHKAN (HANDOVER)' if exitConfirmed else 'MENUNGGU DEBOUNCE (TETAP YARD)'}")

            if exitConfirmed:
                rawLag = scanFinishedEpoch - self.rtcFirstMissEpoch if (self.rtcFirstMissEpoch > 0 and scanFinishedEpoch > self.rtcFirstMissEpoch) else 0
                estSteps = min(31, rawLag // 20) if rawLag <= 620 else 0
                print(f"[ZONE TRANSITION] rawLag={rawLag}s steps={estSteps} firstMiss={self.rtcFirstMissEpoch} nowEpoch={scanFinishedEpoch}")

                if self.pendingFirstMissEpoch > 0:
                    print(f"[ZONE WARN] pendingFirstMissEpoch tertimpa sebelum dipakai! Lama: {self.pendingFirstMissEpoch}, Baru: {self.rtcFirstMissEpoch}")
                self.pendingFirstMissEpoch = self.rtcFirstMissEpoch

                # A.1: Zona TECH hanya disetel setelah koneksi benar-benar sukses (WL_CONNECTED).
                self.setZone(NET_ZONE_OFFLINE, "Handover Exit Yard Disahkan")
                if techRssi > -90:
                    self.startWifiConnectNonBlocking("CONN_CONNECTING_TECH", self.wifiTechSsid)

                self.rtcFirstMissEpoch = 0
                self.rtcYardMissCount = 0
                self.rtcYardHitCount = 0
                self.yardRecoveryCount = 0

    def startWifiConnectNonBlocking(self, target, ssid):
        self.wifiConnState = target
        print(f"[WIFI ASYNC CONNECT] Memulai koneksi ke '{ssid}' (non-blocking, timeout 6s)...")

    def updateWifiAsyncConnect(self, connected, ip="192.168.137.52", durMs=1240):
        if self.wifiConnState == "CONN_IDLE":
            return
        if connected:
            if self.wifiConnState == "CONN_CONNECTING_TECH":
                print(f"[WIFI ASYNC CONNECT] Terhubung ke Hotspot Teknisi '{self.wifiTechSsid}' (IP: {ip}) dalam {durMs}ms")
                self.setZone(NET_ZONE_TECH, "Async Connect Tech Berhasil")
            self.wifiConnState = "CONN_IDLE"
            self.wifiStatus = "WL_CONNECTED"
            self.wifiSsid = self.wifiTechSsid

def run_tests():
    print("================================================================================")
    print("SKENARIO 1: ANTI-FLAPPING DI GERBANG (ZERO-SCAN YARD HOLD)")
    print("================================================================================")
    sim = OrionFirmwareSim()
    # Kendaraan mulai bergerak menuju gerbang
    print("[1] Scan 1: Sinyal gudang melemah di gerbang (-88 dBm)...")
    sim.scanCompleteCallback(scanFinishedEpoch=1767577000, yardRssi=-88, techRssi=-70, lastKnownSpeed=15)
    
    print("\n[2] Kendaraan di batas gerbang, WiFi firmware mendeteksi beacon sesaat:")
    # Zero scan hold evaluation terpanggil
    sim.wifiStatus = "WL_CONNECTED"
    sim.wifiSsid = "DIPO Ruijie"
    sim.wifiRssi = -80
    z, lag = sim.evaluateNetworkZone(ts_epoch=1767577005, speed_kmh=15)
    print(f"    -> Hasil Evaluasi: zone={zone_str(z)}, lag={lag}, missCount={sim.rtcYardMissCount}")
    assert sim.rtcYardMissCount == 1, "FAIL: rtcYardMissCount ter-reset sebelum 2 konfirmasi!"
    assert sim.rtcFirstMissEpoch == 1767577000, "FAIL: rtcFirstMissEpoch ter-reset!"
    print("    -> [VERIFIKASI C.1 PASSED]: Anti-flapping menahan rtcYardMissCount agar tidak ter-reset prematurely!\n")

    print("================================================================================")
    print("SKENARIO 2: EXIT DISAHKAN -> ASYNC CONNECT -> CONNECTED -> TECH_HOTSPOT -> LAG PACK")
    print("================================================================================")
    # Scan 2: Kendaraan melaju keluar gerbang (speed 22 km/h, sinyal gudang hilang)
    print("[3] Scan 2: Kendaraan keluar gerbang (speed 22 km/h, yard RSSI -95 dBm)...")
    sim.wifiStatus = "WL_DISCONNECTED"
    sim.scanCompleteCallback(scanFinishedEpoch=1767577020, yardRssi=-95, techRssi=-65, lastKnownSpeed=22)

    print("\n[4] Iterasi loop berikutnya: WiFi async connect berhasil terhubung:")
    sim.updateWifiAsyncConnect(connected=True, ip="192.168.137.52", durMs=1120)

    print("\n[5] Paket telemetri pertama di zona luar disampel:")
    # Sampling pkt pertama di epoch 1767577042 (42 detik setelah firstMissEpoch=1767577000)
    z1, lag1 = sim.evaluateNetworkZone(ts_epoch=1767577042, speed_kmh=25)
    print(f"    -> Paket #1: zone={zone_str(z1)}, lagSteps={lag1} (expected steps = 42//20 = 2)")
    assert z1 == NET_ZONE_TECH, f"FAIL: Expected NET_ZONE_TECH, got {z1}"
    assert lag1 == 2, f"FAIL: Expected lagSteps=2, got {lag1}"
    assert sim.pendingFirstMissEpoch == 0, "FAIL: pendingFirstMissEpoch belum direset!"

    print("\n[6] Paket telemetri kedua disampel:")
    z2, lag2 = sim.evaluateNetworkZone(ts_epoch=1767577047, speed_kmh=25)
    print(f"    -> Paket #2: zone={zone_str(z2)}, lagSteps={lag2} (expected steps = 0)")
    assert lag2 == 0, f"FAIL: Expected lagSteps=0 on second packet, got {lag2}"
    print("    -> [VERIFIKASI A & B PASSED]: Lag tepat terbawa sekali pada record pertama!")

if __name__ == "__main__":
    run_tests()
