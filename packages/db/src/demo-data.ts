type DemoInventoryItem = {
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  currentStock: number;
  minimumStock: number;
  basePrice: number;
  sellingPrice: number;
};

type DemoSummaryBatch = {
  filename: string;
  periodStart: string;
  periodEnd: string;
  rows: Array<{
    itemCode: string;
    itemName: string;
    category: string;
    qtySold: number;
    grossSales: number;
    netSales: number;
  }>;
};

type DemoTransactionRecord = {
  saleDate: string;
  transactionId: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  qtySold: number;
  grossSales: number;
  netSales: number;
};

export const demoInventoryItems: DemoInventoryItem[] = [
  {
    itemCode: "OLI-MESRAN-1L",
    itemName: "Oli Mesin Mesran Super 1L",
    category: "OLI LEM DAN AIR AKI",
    brand: "Federal",
    currentStock: 4,
    minimumStock: 6,
    basePrice: 42000,
    sellingPrice: 55000,
  },
  {
    itemCode: "BUSI-NGK-CR7HSA",
    itemName: "Busi NGK CR7HSA",
    category: "BUSI MBL BUSI MTR",
    brand: "NGK",
    currentStock: 0,
    minimumStock: 8,
    basePrice: 14000,
    sellingPrice: 22000,
  },
  {
    itemCode: "FILTER-OLI-HONDA",
    itemName: "Filter Oli Honda Beat/Scoopy",
    category: "FILTER UDARA A/F",
    brand: "AHM",
    currentStock: 3,
    minimumStock: 5,
    basePrice: 11000,
    sellingPrice: 18000,
  },
  {
    itemCode: "AKI-GS-ASTRA-35",
    itemName: "Aki GS Astra GTZ5S",
    category: "AKI KABEL DAN SOKET",
    brand: "GS Astra",
    currentStock: 6,
    minimumStock: 2,
    basePrice: 185000,
    sellingPrice: 245000,
  },
  {
    itemCode: "KAMPAS-REM-AVANZA",
    itemName: "Kampas Rem Avanza Xenia Depan",
    category: "KAMPAS REM DPN BLK",
    brand: "Aspira",
    currentStock: 1,
    minimumStock: 4,
    basePrice: 78000,
    sellingPrice: 125000,
  },
  {
    itemCode: "LAMPU-H4-HANNOCHS",
    itemName: "Lampu H4 Hannochs 60/55W",
    category: "LAMPU KABEL DAN SOCKET",
    brand: "Hannochs",
    currentStock: 15,
    minimumStock: 4,
    basePrice: 18000,
    sellingPrice: 35000,
  },
  {
    itemCode: "COOLANT-RADIATOR-1L",
    itemName: "Coolant Radiator Premium 1L",
    category: "COOLANT DAN CAIRAN",
    brand: "Toyota Genuine",
    currentStock: 2,
    minimumStock: 4,
    basePrice: 26000,
    sellingPrice: 42000,
  },
  {
    itemCode: "BEARING-6202",
    itemName: "Bearing 6202 NTN",
    category: "BEARING DAN LAKER",
    brand: "NTN",
    currentStock: 18,
    minimumStock: 5,
    basePrice: 22000,
    sellingPrice: 38000,
  },
  {
    itemCode: "KABEL-TIES-200",
    itemName: "Kabel Ties 2.5 x 200",
    category: "ISOLASI LAKBAN DAN KLEM",
    brand: "UMUM",
    currentStock: 48,
    minimumStock: 12,
    basePrice: 250,
    sellingPrice: 500,
  },
  {
    itemCode: "SHOCK-ABS-MATIC",
    itemName: "Shock Absorber Belakang Matic",
    category: "SHOCKBREAKER",
    brand: "YSS",
    currentStock: 9,
    minimumStock: 2,
    basePrice: 210000,
    sellingPrice: 315000,
  },
  {
    itemCode: "SEAL-REM-PS125",
    itemName: "Karet Rem PS125 1-1/4",
    category: "KARET REM SEAL REM",
    brand: "N2K Auto",
    currentStock: 24,
    minimumStock: 5,
    basePrice: 6000,
    sellingPrice: 10000,
  },
  {
    itemCode: "BAN-DALAM-350-8",
    itemName: "Ban Dalam 3.50-8",
    category: "BAN DAN PENTIL",
    brand: "FDR",
    currentStock: 11,
    minimumStock: 4,
    basePrice: 24000,
    sellingPrice: 42000,
  },
  {
    itemCode: "MUR-RING-TOPI-8",
    itemName: "Mur Baut Flange M8 x 1.25",
    category: "BAUT MUR DAN RING",
    brand: "UMUM",
    currentStock: 120,
    minimumStock: 20,
    basePrice: 450,
    sellingPrice: 1200,
  },
  {
    itemCode: "RANTAI-428H",
    itemName: "Rantai Motor 428H Heavy Duty",
    category: "RANTAI GIR DAN SPROCKET",
    brand: "SSS",
    currentStock: 2,
    minimumStock: 3,
    basePrice: 86000,
    sellingPrice: 145000,
  },
  {
    itemCode: "FILTER-UDARA-L300",
    itemName: "Filter Udara Mitsubishi L300",
    category: "FILTER UDARA A/F",
    brand: "UMUM",
    currentStock: 0,
    minimumStock: 2,
    basePrice: 50000,
    sellingPrice: 180000,
  },
];

export const demoSummaryBatches: DemoSummaryBatch[] = [
  {
    filename: "demo-sales-2026-01.xlsx",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    rows: [
      { itemCode: "BUSI-NGK-CR7HSA", itemName: "Busi NGK CR7HSA", category: "BUSI MBL BUSI MTR", qtySold: 18, grossSales: 396000, netSales: 396000 },
      { itemCode: "OLI-MESRAN-1L", itemName: "Oli Mesin Mesran Super 1L", category: "OLI LEM DAN AIR AKI", qtySold: 14, grossSales: 770000, netSales: 770000 },
      { itemCode: "FILTER-OLI-HONDA", itemName: "Filter Oli Honda Beat/Scoopy", category: "FILTER UDARA A/F", qtySold: 16, grossSales: 288000, netSales: 288000 },
      { itemCode: "KAMPAS-REM-AVANZA", itemName: "Kampas Rem Avanza Xenia Depan", category: "KAMPAS REM DPN BLK", qtySold: 7, grossSales: 875000, netSales: 875000 },
      { itemCode: "COOLANT-RADIATOR-1L", itemName: "Coolant Radiator Premium 1L", category: "COOLANT DAN CAIRAN", qtySold: 5, grossSales: 210000, netSales: 210000 },
      { itemCode: "SEAL-REM-PS125", itemName: "Karet Rem PS125 1-1/4", category: "KARET REM SEAL REM", qtySold: 9, grossSales: 90000, netSales: 90000 },
      { itemCode: "MUR-RING-TOPI-8", itemName: "Mur Baut Flange M8 x 1.25", category: "BAUT MUR DAN RING", qtySold: 11, grossSales: 13200, netSales: 13200 },
      { itemCode: "FILTER-UDARA-L300", itemName: "Filter Udara Mitsubishi L300", category: "FILTER UDARA A/F", qtySold: 4, grossSales: 720000, netSales: 720000 },
    ],
  },
  {
    filename: "demo-sales-2026-02.xlsx",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    rows: [
      { itemCode: "BUSI-NGK-CR7HSA", itemName: "Busi NGK CR7HSA", category: "BUSI MBL BUSI MTR", qtySold: 16, grossSales: 352000, netSales: 352000 },
      { itemCode: "OLI-MESRAN-1L", itemName: "Oli Mesin Mesran Super 1L", category: "OLI LEM DAN AIR AKI", qtySold: 11, grossSales: 605000, netSales: 605000 },
      { itemCode: "FILTER-OLI-HONDA", itemName: "Filter Oli Honda Beat/Scoopy", category: "FILTER UDARA A/F", qtySold: 13, grossSales: 234000, netSales: 234000 },
      { itemCode: "KAMPAS-REM-AVANZA", itemName: "Kampas Rem Avanza Xenia Depan", category: "KAMPAS REM DPN BLK", qtySold: 8, grossSales: 1000000, netSales: 1000000 },
      { itemCode: "COOLANT-RADIATOR-1L", itemName: "Coolant Radiator Premium 1L", category: "COOLANT DAN CAIRAN", qtySold: 6, grossSales: 252000, netSales: 252000 },
      { itemCode: "SEAL-REM-PS125", itemName: "Karet Rem PS125 1-1/4", category: "KARET REM SEAL REM", qtySold: 10, grossSales: 100000, netSales: 100000 },
      { itemCode: "MUR-RING-TOPI-8", itemName: "Mur Baut Flange M8 x 1.25", category: "BAUT MUR DAN RING", qtySold: 9, grossSales: 10800, netSales: 10800 },
      { itemCode: "FILTER-UDARA-L300", itemName: "Filter Udara Mitsubishi L300", category: "FILTER UDARA A/F", qtySold: 2, grossSales: 360000, netSales: 360000 },
    ],
  },
  {
    filename: "demo-sales-2026-03.xlsx",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-28",
    rows: [
      { itemCode: "BUSI-NGK-CR7HSA", itemName: "Busi NGK CR7HSA", category: "BUSI MBL BUSI MTR", qtySold: 21, grossSales: 462000, netSales: 462000 },
      { itemCode: "OLI-MESRAN-1L", itemName: "Oli Mesin Mesran Super 1L", category: "OLI LEM DAN AIR AKI", qtySold: 12, grossSales: 660000, netSales: 660000 },
      { itemCode: "FILTER-OLI-HONDA", itemName: "Filter Oli Honda Beat/Scoopy", category: "FILTER UDARA A/F", qtySold: 18, grossSales: 324000, netSales: 324000 },
      { itemCode: "KAMPAS-REM-AVANZA", itemName: "Kampas Rem Avanza Xenia Depan", category: "KAMPAS REM DPN BLK", qtySold: 9, grossSales: 1125000, netSales: 1125000 },
      { itemCode: "COOLANT-RADIATOR-1L", itemName: "Coolant Radiator Premium 1L", category: "COOLANT DAN CAIRAN", qtySold: 4, grossSales: 168000, netSales: 168000 },
      { itemCode: "SEAL-REM-PS125", itemName: "Karet Rem PS125 1-1/4", category: "KARET REM SEAL REM", qtySold: 20, grossSales: 200000, netSales: 200000 },
      { itemCode: "MUR-RING-TOPI-8", itemName: "Mur Baut Flange M8 x 1.25", category: "BAUT MUR DAN RING", qtySold: 12, grossSales: 14400, netSales: 14400 },
      { itemCode: "FILTER-UDARA-L300", itemName: "Filter Udara Mitsubishi L300", category: "FILTER UDARA A/F", qtySold: 5, grossSales: 900000, netSales: 900000 },
    ],
  },
];

export const demoTransactionRecords: DemoTransactionRecord[] = [
  {
    saleDate: "2026-03-23",
    transactionId: "INV-2301",
    itemCode: "KABEL-TIES-200",
    itemName: "Kabel Ties 2.5 x 200",
    category: "ISOLASI LAKBAN DAN KLEM",
    brand: "UMUM",
    qtySold: 20,
    grossSales: 10000,
    netSales: 10000,
  },
  {
    saleDate: "2026-03-24",
    transactionId: "INV-2302",
    itemCode: "LAMPU-H4-HANNOCHS",
    itemName: "Lampu H4 Hannochs 60/55W",
    category: "LAMPU KABEL DAN SOCKET",
    brand: "Hannochs",
    qtySold: 4,
    grossSales: 140000,
    netSales: 140000,
  },
  {
    saleDate: "2026-03-25",
    transactionId: "INV-2303",
    itemCode: "BAN-DALAM-350-8",
    itemName: "Ban Dalam 3.50-8",
    category: "BAN DAN PENTIL",
    brand: "FDR",
    qtySold: 3,
    grossSales: 126000,
    netSales: 126000,
  },
  {
    saleDate: "2026-03-26",
    transactionId: "INV-2304",
    itemCode: "RANTAI-428H",
    itemName: "Rantai Motor 428H Heavy Duty",
    category: "RANTAI GIR DAN SPROCKET",
    brand: "SSS",
    qtySold: 2,
    grossSales: 290000,
    netSales: 290000,
  },
];
