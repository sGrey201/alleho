import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { t } from "../client/src/lib/i18n.ts";
import { convertI18nSectionsToStructure } from "../shared/questionnaireTypes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const structure = convertI18nSectionsToStructure(t.questionnaireSections);
const outPath = join(__dirname, "../shared/defaultQuestionnaireStructure.json");
writeFileSync(outPath, JSON.stringify(structure, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${structure.root.length} root sections)`);
