'use client';

import Link from 'next/link';
import { HarAnalysis } from '@/types/har';
import { getAllStatusCodes, getAllContentTypes, getAllServerIPs } from '@/utils/harParser';
import { statusColorClass } from '@/components/StatusBadge';

interface ComparisonTableProps {
  analyses: HarAnalysis[];
}

function Cell({ value }: { value: number | undefined }) {
  if (!value) return <span className="text-slate-600">—</span>;
  return <span className="font-mono">{value.toLocaleString()}</span>;
}

export default function ComparisonTable({ analyses }: ComparisonTableProps) {
  const allStatusCodes = getAllStatusCodes(analyses);
  const allContentTypes = getAllContentTypes(analyses);
  const allServerIPs = getAllServerIPs(analyses);

  const thClass = 'py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60';
  const tdClass = 'py-2.5 px-4 text-sm text-slate-300 border-t border-slate-700/50 text-right';
  const labelTdClass = 'py-2.5 px-4 text-sm border-t border-slate-700/50';
  const sectionRowClass = 'bg-slate-800/80';

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${thClass} w-64 text-left`}>Metric</th>
            {analyses.map((a) => (
              <th key={a.fileIndex} className={`${thClass} text-right min-w-[140px]`}>
                <span className="block truncate max-w-[160px] ml-auto" title={a.fileName}>
                  {a.fileName}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Total Requests */}
          <tr className="bg-slate-800/30 hover:bg-slate-800/60 transition-colors">
            <td className={`${labelTdClass} font-semibold text-slate-200`}>Total Requests</td>
            {analyses.map((a) => (
              <td key={a.fileIndex} className={tdClass}>
                <span className="font-mono font-semibold">{a.totalRequests.toLocaleString()}</span>
              </td>
            ))}
          </tr>

          {/* Unique URLs */}
          <tr className="hover:bg-slate-800/60 transition-colors">
            <td className={labelTdClass}>
              <Link
                href="/details?type=url"
                className="text-blue-400 hover:text-blue-300 hover:underline font-medium transition-colors"
              >
                Unique URLs
              </Link>
            </td>
            {analyses.map((a) => (
              <td key={a.fileIndex} className={tdClass}>
                <Cell value={a.uniqueUrlCount} />
              </td>
            ))}
          </tr>

          {/* Status Codes Section */}
          <tr className={sectionRowClass}>
            <td colSpan={analyses.length + 1} className="py-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-t border-slate-700">
              Status Codes
            </td>
          </tr>
          {allStatusCodes.map((code) => (
            <tr key={code} className="hover:bg-slate-800/60 transition-colors">
              <td className={labelTdClass}>
                <Link
                  href={`/details?type=status&value=${code}`}
                  className={`${statusColorClass(code)} hover:underline font-mono font-medium transition-colors`}
                >
                  {code}
                </Link>
              </td>
              {analyses.map((a) => (
                <td key={a.fileIndex} className={tdClass}>
                  <Cell value={a.statusCodeCounts[code]} />
                </td>
              ))}
            </tr>
          ))}

          {/* Content Types Section */}
          <tr className={sectionRowClass}>
            <td colSpan={analyses.length + 1} className="py-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-t border-slate-700">
              Content Types
            </td>
          </tr>
          {allContentTypes.map((ct) => (
            <tr key={ct} className="hover:bg-slate-800/60 transition-colors">
              <td className={labelTdClass}>
                <Link
                  href={`/details?type=contentType&value=${encodeURIComponent(ct)}`}
                  className="text-purple-400 hover:text-purple-300 hover:underline font-mono text-xs transition-colors"
                >
                  {ct}
                </Link>
              </td>
              {analyses.map((a) => (
                <td key={a.fileIndex} className={tdClass}>
                  <Cell value={a.contentTypeCounts[ct]} />
                </td>
              ))}
            </tr>
          ))}

          {/* Server IPs Section */}
          <tr className={sectionRowClass}>
            <td colSpan={analyses.length + 1} className="py-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-t border-slate-700">
              Server IPs
            </td>
          </tr>
          {allServerIPs.length === 0 ? (
            <tr>
              <td className={`${labelTdClass} text-slate-600 italic text-xs`}>No data — re-upload to populate</td>
              {analyses.map((a) => (
                <td key={a.fileIndex} className={tdClass}><span className="text-slate-600">—</span></td>
              ))}
            </tr>
          ) : (
            allServerIPs.map((ip) => (
              <tr key={ip} className="hover:bg-slate-800/60 transition-colors">
                <td className={labelTdClass}>
                  <Link
                    href={`/details?type=serverIPAddress&value=${encodeURIComponent(ip)}`}
                    className={`hover:underline font-mono text-xs transition-colors italic ${ip === '(no IP)' ? 'text-slate-400 hover:text-slate-200' : 'text-cyan-400 hover:text-cyan-300 not-italic'}`}
                  >
                    {ip}
                  </Link>
                </td>
                {analyses.map((a) => (
                  <td key={a.fileIndex} className={tdClass}>
                    <Cell value={a.serverIPCounts?.[ip]} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
