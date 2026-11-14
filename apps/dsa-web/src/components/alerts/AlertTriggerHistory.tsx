import type React from 'react';
import { Activity } from 'lucide-react';
import { Badge, Card, EmptyState, Loading } from '../common';
import type { AlertTriggerItem } from '../../types/alerts';
import { formatDateTime } from '../../utils/format';
import { getMarketPhaseSummaryLabel } from '../../utils/marketPhase';
import { useUiLanguage } from '../../contexts/UiLanguageContext';
import type { UiLanguage } from '../../i18n/uiText';

const statusLabel: Record<string, [string, string]> = {
  triggered: ['已触发', 'Triggered'],
  skipped: ['已跳过', 'Skipped'],
  degraded: ['降级', 'Degraded'],
  failed: ['失败', 'Failed'],
};

function formatStatusLabel(status: string, language: UiLanguage): string {
  const label = statusLabel[status];
  if (!label) return status;
  return language === 'en' ? label[1] : label[0];
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'triggered') return 'success';
  if (status === 'skipped' || status === 'degraded') return 'warning';
  if (status === 'failed') return 'danger';
  return 'default';
}

function formatNullable(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

function renderPhaseQuality(trigger: AlertTriggerItem, language: UiLanguage): React.ReactNode {
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const phase = getMarketPhaseSummaryLabel(trigger.marketPhaseSummary, language);
  const quality = trigger.analysisContextPackOverview?.dataQuality?.level;
  const limitations = trigger.analysisContextPackOverview?.dataQuality?.limitations?.slice(0, 2) ?? [];
  if (!phase && !quality && limitations.length === 0) {
    return <span className="text-xs text-muted-text">--</span>;
  }
  return (
    <div className="space-y-1">
      {phase ? (
        <Badge variant="default">
          {phase.replace('市场阶段: ', '').replace('市场阶段：', '').replace('Market phase: ', '')}
        </Badge>
      ) : null}
      {quality ? <div className="text-xs text-secondary-text">{L('质量：', 'Quality: ')}{quality}</div> : null}
      {limitations.length ? (
        <div className="max-w-[180px] text-xs text-muted-text">{limitations.join(L('；', '; '))}</div>
      ) : null}
    </div>
  );
}

interface AlertTriggerHistoryProps {
  triggers: AlertTriggerItem[];
  isLoading?: boolean;
}

export const AlertTriggerHistory: React.FC<AlertTriggerHistoryProps> = ({ triggers, isLoading = false }) => {
  const { language } = useUiLanguage();
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);

  return (
    <Card
      title={L('触发历史', 'Trigger history')}
      subtitle={L('评估记录', 'Evaluation records')}
      variant="bordered"
      padding="md"
    >
      {isLoading ? <Loading label={L('正在加载触发历史', 'Loading trigger history')} /> : null}
      {!isLoading && triggers.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-6 w-6" />}
          title={L('暂无触发历史', 'No trigger history yet')}
          description={L(
            '后台评估会记录 triggered、skipped、degraded 和 failed 状态；正常未触发不会写入历史。',
            'Background evaluations record triggered, skipped, degraded, and failed states. A normal non-trigger is not written to history.',
          )}
        />
      ) : null}
      {!isLoading && triggers.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border/60 text-xs uppercase text-muted-text">
              <tr>
                <th className="px-3 py-2 font-medium">{L('状态', 'Status')}</th>
                <th className="px-3 py-2 font-medium">{L('阶段 / 质量', 'Phase / Quality')}</th>
                <th className="px-3 py-2 font-medium">{L('目标', 'Target')}</th>
                <th className="px-3 py-2 font-medium">{L('观察值', 'Observed')}</th>
                <th className="px-3 py-2 font-medium">{L('阈值', 'Threshold')}</th>
                <th className="px-3 py-2 font-medium">{L('数据源', 'Data source')}</th>
                <th className="px-3 py-2 font-medium">{L('数据时间', 'Data time')}</th>
                <th className="px-3 py-2 font-medium">{L('原因', 'Reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {triggers.map((trigger) => (
                <tr key={trigger.id} className="align-top">
                  <td className="px-3 py-3">
                    <Badge variant={statusVariant(trigger.status)}>
                      {formatStatusLabel(trigger.status, language)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">{renderPhaseQuality(trigger, language)}</td>
                  <td className="px-3 py-3 font-mono text-secondary-text">{trigger.target}</td>
                  <td className="px-3 py-3 text-secondary-text">{formatNullable(trigger.observedValue)}</td>
                  <td className="px-3 py-3 text-secondary-text">{formatNullable(trigger.threshold)}</td>
                  <td className="px-3 py-3 text-secondary-text">{formatNullable(trigger.dataSource)}</td>
                  <td className="px-3 py-3 text-xs text-secondary-text">
                    {formatDateTime(trigger.dataTimestamp ?? trigger.triggeredAt)}
                  </td>
                  <td className="px-3 py-3 text-secondary-text">
                    {trigger.reason || trigger.diagnostics || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
};
