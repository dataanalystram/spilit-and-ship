import * as aq from 'arquero';
import type { ETLTransformationConfig, CompanyMetric } from '../types';

export const transformToCompanyMetrics = (
    data: any[],
    config: ETLTransformationConfig
): CompanyMetric[] => {
    if (!data || data.length === 0 || config.metricColumns.length === 0) return [];
    
    const runDate = new Date().toISOString().split('T')[0];

    // Initialize Arquero DataFrame
    let table = aq.from(data);

    // Filter out rows missing the core Company ID
    table = table.filter(aq.escape((d: any) => !!d[config.companyIdColumn]));

    // MELT / UNPIVOT Operation utilizing robust Arquero memory management
    // Folds the wide metric arrays into vertical rows instantly
    let folded = table.fold(config.metricColumns, { as: ['Metric Name', 'Actual Value'] });

    // Filter out rows where the melted metric value was completely empty/null
    folded = folded.filter(aq.escape((d: any) => {
        const val = d['Actual Value'];
        return val !== undefined && val !== null && String(val).trim() !== '';
    }));

    // Deduplicate against structural duplicates resulting from the fold
    // (Ensure we don't output 2 exact rows if source had duplicates not cleaned)
    folded = folded.dedupe();

    const results: CompanyMetric[] = [];

    // Derive semantic Gainsight types
    folded.objects().forEach((row: any) => {
        let metricDate = runDate;
        if (config.dateColumn && row[config.dateColumn]) {
            metricDate = String(row[config.dateColumn]);
        }

        const value = row['Actual Value'];
        
        // Auto-infer UoM (Percent, Integer, Financial, String)
        let uom = "String";
        const valStr = String(value);
        const numStr = valStr.replace(/,/g, '').replace(/\$/g, '').replace(/%/g, '');
        const isNumeric = !isNaN(Number(numStr)) && numStr.trim() !== '';

        if (isNumeric) {
            if (valStr.includes('%')) {
                uom = "Percentage";
            } else if (valStr.includes('$')) {
                uom = "Currency";
            } else if (numStr.includes('.')) {
                uom = "Numeric";
            } else {
                uom = "Integer";
            }
        }

        const record: Record<string, string> = {
            "Company ID": String(row[config.companyIdColumn]),
            "Relationship ID": config.relationshipIdColumn ? String(row[config.relationshipIdColumn] || '') : '',
            "Data Source": config.dataSource || 'CSV Upload',
            "Metric Name": String(row['Metric Name']),
            "Metric Date": metricDate,
            "Time Granularity": config.timeGranularity
        };

        if (config.baselineColumn) {
            record["Baseline Value"] = String(row[config.baselineColumn] || '');
        }

        if (config.targetColumn) {
            record["Target Value"] = String(row[config.targetColumn] || '');
        }

        record["Actual Value"] = isNumeric ? numStr : valStr;
        record["Unit of Measure"] = uom;

        if (config.extraColumns && config.extraColumns.length > 0) {
            config.extraColumns.forEach(extraCol => {
                record[extraCol] = String(row[extraCol] || '');
            });
        }

        results.push(record);
    });

    return results;
}
