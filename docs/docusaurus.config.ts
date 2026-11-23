import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const config: Config = {
  title: "ORION Telemetry",
  tagline: "Dokumentasi Teknis Sistem Telemetri Baterai 12V, OBD-II CAN Bus & Digital Twin Stock Yard",
  favicon: "img/favicon.ico",

  url: "https://www.oriontelemetry.tech",
  baseUrl: "/docs/",
  trailingSlash: true,

  organizationName: "Syzafid",
  projectName: "OrionTelemetry",

  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "id",
    locales: ["id"],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
      options: {
        htmlLabels: false,
        flowchart: {
          htmlLabels: false,
        },
        state: {
          htmlLabels: false,
        },
      },
    },
    navbar: {
      title: "ORION DOCS",
      logo: {
        alt: "Logo ORION Telemetry",
        src: "img/orion_icon_light.svg",
        srcDark: "img/orion_icon_dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "technicalSidebar",
          position: "left",
          label: "Spesifikasi Teknis",
        },
        {
          href: "https://www.oriontelemetry.tech/",
          label: "Beranda",
          position: "right",
        },
        {
          href: "https://www.oriontelemetry.tech/dashboard",
          label: "Konsol HMI",
          position: "right",
        },
        {
          href: "https://github.com/Syzafid/OrionTelemetry",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Arsitektur",
          items: [
            { label: "Ikhtisar Sistem", to: "/" },
            { label: "Diagram Alir Data (DFD)", to: "/architecture/data-flow-dfd/" },
            { label: "Peta Alur PCB v2.0", to: "/hardware/pcb-v2-blueprint-layout/" },
            { label: "Alur Kelistrikan PCB v2.0", to: "/hardware/electrical-flow/" },
            { label: "Skematik Hardware PCB", to: "/hardware/electrical-schematic/" },
            { label: "Firmware ESP32 v1.6.0", to: "/firmware/telemetry-struct/" },
          ],
        },
        {
          title: "Backend & Algoritma",
          items: [
            { label: "Skema MySQL", to: "/backend-api/database-schema/" },
            { label: "Ingest & Piggyback ACK", to: "/backend-api/ingest-and-piggyback/" },
            { label: "Kalibrasi ADC & Prognostik", to: "/algorithms/adc-ols-calibration/" },
          ],
        },
        {
          title: "Aplikasi & Operasi",
          items: [
            { label: "Halaman Utama", href: "https://www.oriontelemetry.tech/" },
            { label: "Workbench HMI", href: "https://www.oriontelemetry.tech/dashboard" },
            { label: "Deployment & CI/CD", to: "/hmi-operations/deployment-ci-cd/" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ORION Telemetry System. Ditenagai oleh Docusaurus v3.10.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ["cpp", "php", "sql", "bash", "json", "typescript", "apacheconf"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
