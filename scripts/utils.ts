import fs from "fs/promises";
import path from "path";
import CliTable3 from "cli-table3";
import chalk from "chalk";

declare namespace Table {
  type ContractType = "proxy" | "deploy" | "verify";

  type ContractInfo = {
    name: string;
    type: ContractType;
    address: string;
  };
}

export class Table extends CliTable3 {
  constructor() {
    super({
      head: [chalk.bold("Contract"), chalk.bold("Type"), chalk.bold("Address")],
      style: { head: [], border: [], "padding-left": 2, "padding-right": 2 },
      chars: {
        mid: "·",
        "top-mid": "|",
        "left-mid": " ·",
        "mid-mid": "|",
        "right-mid": "·",
        left: " |",
        "top-left": " ·",
        "top-right": "·",
        "bottom-left": " ·",
        "bottom-right": "·",
        middle: "·",
        top: "-",
        bottom: "-",
        "bottom-mid": "|",
      },
    });
  }

  add(data: Table.ContractInfo[]) {
    const rows = data.map((item) => [item.name, item.type, item.address]);
    this.push(...rows);
  }

  toObject(types: Table.ContractType[] | "all"): Record<string, string> {
    return this.reduce((result: any, row: any) => {
      if (types.includes(row[1]) || types == "all")
        result[`${row[0]}_${row[1]}`] = row[2];
      return result;
    }, {});
  }

  toArray(
    types: Table.ContractType[] | "all" = "all"
  ): [string, Table.ContractType, string][] {
    return super.filter(
      (row: any) => types.includes(row[1]) || types == "all"
    ) as [string, Table.ContractType, string][];
  }

  log() {
    console.log(this.toString());
  }

  async save(
    destination: string,
    fileName: string
  ): Promise<Record<string, string>> {
    await fs.mkdir(destination, { recursive: true });

    const filePath = path.join(destination, fileName);
    const data = this.toObject("all");
    await fs.writeFile(filePath, JSON.stringify(data));

    console.log(`Saved at: ${filePath}`);
    return data;
  }
}

