import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Text, Dimensions, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart, BarChart, PieChart, yAxisSides } from 'react-native-gifted-charts';
import { useKPI } from '@/context/kpi-context';
import { useThemeContext } from '@/context/theme-context';

import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';

const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 80;

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toFixed(0);
}

function formatPct(n: number | null): string {
  if (n === null) return '-';
  const sign = n > 0 ? '↗ ' : n < 0 ? '↘ ' : '';
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

function shortDate(d: string): string {
  const parts = d.split('.');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1];
    const year = parts[2].substring(2);
    const months: Record<string, string> = {
      '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis',
      '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu',
      '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara'
    };
    const mStr = months[month] || '';
    if (day === '01') return `${mStr}${year}`;
    return `${day} ${mStr}`;
  }
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return d;
}

function calcMax(val: number) {
  if (val <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const step = Math.ceil((val || 1) / mag) * mag / 4;
  return step * 4;
}

function calcMin(val: number) {
  if (val <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  return Math.floor(val / mag) * mag;
}

function TooltipTracker({ item, onUpdate }: any) {
  React.useEffect(() => {
    onUpdate(item);
    Haptics.selectionAsync();
  }, [item, onUpdate]);

  return <View />;
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { computed, loading } = useKPI();
  const { colors, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();

  const latest = computed.length > 0 ? computed[computed.length - 1] : null;
  const lastHapticRef = useRef<string | null>(null);
  const [isChartBusy, setIsChartBusy] = useState(false);

  const summaryCards = useMemo(() => {
    if (!latest) return [];
    return [
      {
        label: t('dashboard.totalDownloads'),
        value: formatNum(latest.downloadTotal),
        change: latest.downloadChange,
        color: colors.accent,
      },
      {
        label: t('dashboard.activeUsers'),
        value: formatNum(latest.activeUsers),
        change: latest.activeUsersChange,
        color: colors.green,
      },
      {
        label: 'MAU & DAU',
        value: formatNum(latest.mau),
        change: latest.mauChange,
        color: colors.blue,
      },
      {
        label: t('dashboard.stickiness'),
        value: latest.stickiness.toFixed(1) + '%',
        change: null,
        color: colors.orange,
      },
    ];
  }, [latest, colors, t]);

  const [activeDownload, setActiveDownload] = useState<any>(null);
  const [activeUser, setActiveUser] = useState<any>(null);

  const downloadPointerComponent = (items: any) => {
    return <TooltipTracker item={items[0]} onUpdate={setActiveDownload} />;
  };

  const usersPointerComponent = (items: any) => {
    return <TooltipTracker item={items[0]} onUpdate={setActiveUser} />;
  };

  const [activeEngagement, setActiveEngagement] = useState<any>(null);
  const engagementPointerComponent = (items: any) => {
    return <TooltipTracker item={items[0]} onUpdate={setActiveEngagement} />;
  };

  const iosLineData = useMemo(() => {
    return computed.map((e) => ({
      value: e.downloadIos,
      label: shortDate(e.date),
      dateFull: e.date,
      change: e.downloadChange,
      total: e.downloadTotal,
      ios: e.downloadIos,
      android: e.downloadAndroid,
    }));
  }, [computed]);

  const androidLineData = useMemo(() => {
    return computed.map((e) => ({
      value: e.downloadAndroid,
    }));
  }, [computed]);

  const minDownload = useMemo(() => {
    if (iosLineData.length === 0) return 0;
    const minVal = Math.min(
      ...iosLineData.map(d => d.value),
      ...androidLineData.map(d => d.value)
    );
    return Math.max(0, calcMin(minVal));
  }, [iosLineData, androidLineData]);

  const maxDownload = useMemo(() => {
    if (iosLineData.length === 0) return 0;
    const maxVal = Math.max(
      ...iosLineData.map(d => d.value),
      ...androidLineData.map(d => d.value)
    );
    return calcMax(maxVal);
  }, [iosLineData, androidLineData]);

  const mauDauBarData = useMemo(() => {
    const arr: any[] = [];
    computed.forEach((e) => {
      arr.push({
        value: e.mau,
        frontColor: colors.chartLine1,
        label: shortDate(e.date),
        spacing: 4,
        dateFull: e.date,
        mau: e.mau,
        dau: e.dau,
        stickiness: e.stickiness,
      });
      arr.push({
        value: e.dau,
        frontColor: colors.chartLine2,
        spacing: 32,
        dateFull: e.date,
        mau: e.mau,
        dau: e.dau,
        stickiness: e.stickiness,
      });
    });
    return arr;
  }, [computed, colors]);

  const maxMauDau = useMemo(() => {
    if (computed.length === 0) return 0;
    const maxVal = Math.max(...computed.map(c => Math.max(c.mau, c.dau)));
    return calcMax(maxVal);
  }, [computed]);

  const stickinessLineData = useMemo(() => {
    return computed.map((e) => ({
      value: e.stickiness,
      dateFull: e.date,
      mau: e.mau,
      dau: e.dau,
      stickiness: e.stickiness,
    }));
  }, [computed]);

  const minStickiness = useMemo(() => {
    if (computed.length === 0) return 0;
    const minVal = Math.min(...computed.map(c => c.stickiness));
    return Math.max(0, Math.floor(minVal - 2)); 
  }, [computed]);
  
  const maxStickiness = useMemo(() => {
    if (computed.length === 0) return 0;
    const maxVal = Math.max(...computed.map(c => c.stickiness));
    const range = maxVal - minStickiness;
    const step = Math.ceil((range || 1) / 4);
    return minStickiness + step * 4;
  }, [computed, minStickiness]);

  const comboWidth = useMemo(() => Math.max(chartWidth, computed.length * 72 + 60), [chartWidth, computed.length]);

  const activeUsersLineData = useMemo(() => {
    return computed.map((e) => ({
      value: e.activeUsers,
      label: shortDate(e.date),
      dateFull: e.date,
      change: e.activeUsersChange,
    }));
  }, [computed]);

  const minActive = useMemo(() => {
    if (activeUsersLineData.length === 0) return 0;
    const minVal = Math.min(...activeUsersLineData.map(d => d.value));
    return calcMin(minVal);
  }, [activeUsersLineData]);

  const maxActive = useMemo(() => {
    if (activeUsersLineData.length === 0) return 0;
    const maxVal = Math.max(...activeUsersLineData.map(d => d.value));
    return calcMax(maxVal);
  }, [activeUsersLineData]);

  const pushPieData = useMemo(() => {
    if (!latest) return [];
    return [
      { value: latest.pushOptInIos, color: colors.chartLine1, text: 'iOS' },
      { value: latest.pushOptInAndroid, color: colors.chartLine2, text: 'And' },
    ];
  }, [latest, colors]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (computed.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.emptyIcon]}>📊</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('dashboard.noData')}</Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('dashboard.noDataDesc')}</Text>
      </View>
    );
  }

  const commonChartProps = {
    initialSpacing: 20,
    yAxisTextStyle: { color: colors.textTertiary, fontSize: 10 },
    xAxisLabelTextStyle: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
    hideRules: true,
    yAxisColor: 'transparent',
    xAxisColor: 'transparent',
    noOfSections: 4,
    yAxisLabelWidth: 45,
    formatYLabel: (label: string) => formatNum(Number(label.replace(/,/g, ''))),
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        directionalLockEnabled={true}
      >
        <Text style={[styles.header, { color: colors.text }]}>{t('dashboard.title')}</Text>

        {/* Task Summary Concept (Fancy Colored Cards) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsRow} contentContainerStyle={styles.cardsContent}>
          {summaryCards.map((card, i) => (
            <View key={i} style={[styles.fancyCard, { backgroundColor: card.color }]}>
              <Text style={styles.fancyCardLabel}>{card.label}</Text>
              <Text style={styles.fancyCardValue}>{card.value}</Text>
              {card.change !== null && (
                <Text style={styles.fancyCardChange}>
                  {formatPct(card.change)}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Total Downloads (Rounded Bar Chart) */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          <View style={styles.chartCardHeaderRow}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>{t('dashboard.totalDownloads')}</Text>
            {activeDownload && (
              <View style={styles.staticTooltip}>
                <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{activeDownload.dateFull}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.tooltipTitleValue, { color: colors.text }]}>Tot: {formatNum(activeDownload.total)}</Text>
                  {activeDownload.change !== null && activeDownload.change !== undefined && (
                    <Text style={[styles.tooltipChange, { color: activeDownload.change >= 0 ? colors.green : colors.red }]}>
                      {formatPct(activeDownload.change)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.tooltipDate, { color: colors.textTertiary, marginTop: 4, fontSize: 10 }]}>
                  iOS: {formatNum(activeDownload.ios)} · And: {formatNum(activeDownload.android)}
                </Text>
              </View>
            )}
          </View>
          <LineChart
            {...commonChartProps}
            data={iosLineData}
            data2={androidLineData}
            yAxisOffset={minDownload}
            maxValue={maxDownload - minDownload}
            stepValue={(maxDownload - minDownload) / 4}
            width={chartWidth}
            height={180}
            thickness={3}
            thickness2={3}
            color={colors.chartLine1}
            color2={colors.chartLine2}
            hideDataPoints
            curved
            isAnimated
            pointerConfig={{
              pointerStripHeight: 180,
              pointerStripColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              pointerStripWidth: 2,
              pointerColor: colors.accent,
              radius: 6,
              pointerLabelWidth: 100,
              pointerLabelHeight: 80,
              activatePointersOnLongPress: false,
              activatePointersDelay: 50,
              autoAdjustPointerLabelPosition: true,
              persistPointer: true,
              pointerLabelComponent: downloadPointerComponent,
            }}
          />
          <View style={[styles.legendRowHorizontal, { marginTop: 20, justifyContent: 'center' }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine1, width: 8, height: 8 }]} />
              <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>iOS</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine2, width: 8, height: 8 }]} />
              <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>And</Text>
            </View>
          </View>
        </View>

        {/* Detailed Active Users (Curved Glowing Line) */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          <View style={styles.chartCardHeaderRow}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>{t('dashboard.activeUsersTrend')}</Text>
            {activeUser && (
              <View style={styles.staticTooltip}>
                <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{activeUser.dateFull}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.tooltipTitleValue, { color: colors.text }]}>{formatNum(activeUser.value)}</Text>
                  {activeUser.change !== null && activeUser.change !== undefined && (
                    <Text style={[styles.tooltipChange, { color: activeUser.change >= 0 ? colors.green : colors.red }]}>
                      {formatPct(activeUser.change)}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
          <LineChart
            {...commonChartProps}
            data={activeUsersLineData}
            yAxisOffset={minActive}
            maxValue={maxActive - minActive}
            stepValue={(maxActive - minActive) / 4}
            width={chartWidth}
            height={180}
            thickness={4}
            color={colors.green}
            hideDataPoints
            curved
            isAnimated
            pointerConfig={{
              pointerStripHeight: 180,
              pointerStripColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              pointerStripWidth: 2,
              pointerColor: colors.green,
              radius: 6,
              pointerLabelWidth: 100,
              pointerLabelHeight: 80,
              activatePointersOnLongPress: false,
              activatePointersDelay: 50,
              autoAdjustPointerLabelPosition: true,
              persistPointer: true,
              pointerLabelComponent: usersPointerComponent,
            }}
          />
        </View>

        {/* Engagement Combo Chart (MAU/DAU & Stickiness) */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          <View style={styles.chartCardHeaderRow}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>{t('dashboard.engagementTrend', 'Engagement Trend')}</Text>
            {activeEngagement && (
              <View style={styles.staticTooltip}>
                <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{activeEngagement.dateFull}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.tooltipTitleValue, { color: colors.text }]}>Stk: {formatPct(activeEngagement.stickiness)}</Text>
                </View>
                <Text style={[styles.tooltipDate, { color: colors.textTertiary, marginTop: 4, fontSize: 10 }]}>
                  MAU: {formatNum(activeEngagement.mau)} · DAU: {formatNum(activeEngagement.dau)}
                </Text>
              </View>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <View style={{ width: comboWidth, paddingBottom: 40 }}>
              <BarChart
                {...commonChartProps}
                data={mauDauBarData}
                maxValue={maxMauDau}
                stepValue={maxMauDau / 4}
                width={comboWidth}
                height={180}
                barWidth={18}
                barBorderRadius={3}
                xAxisLabelsHeight={30}
                isAnimated
              />
              <View style={{ position: 'absolute', top: 0, left: 0, width: comboWidth, height: 180 }}>
                <LineChart
                  data={stickinessLineData}
                  maxValue={maxStickiness - minStickiness}
                  yAxisOffset={minStickiness}
                  stepValue={(maxStickiness - minStickiness) / 4}
                  width={comboWidth}
                  height={180}
                  yAxisSide={yAxisSides.RIGHT}
                  thickness={3}
                  color={colors.orange}
                  hideDataPoints={false}
                  dataPointsRadius={4}
                  dataPointsColor={colors.orange}
                  hideRules
                  hideYAxisText={false}
                  yAxisTextStyle={{ color: colors.textTertiary, fontSize: 10 }}
                  hideAxesAndRules
                  initialSpacing={85}
                  spacing={72}
                  isAnimated
                  pointerConfig={{
                    pointerStripHeight: 180,
                    pointerStripColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    pointerStripWidth: 2,
                    pointerColor: colors.orange,
                    radius: 6,
                    pointerLabelWidth: 100,
                    pointerLabelHeight: 80,
                    activatePointersOnLongPress: false,
                    activatePointersDelay: 50,
                    autoAdjustPointerLabelPosition: true,
                    persistPointer: true,
                    pointerLabelComponent: engagementPointerComponent,
                  }}
                />
              </View>
            </View>
          </ScrollView>
          <View style={[styles.legendRowHorizontal, { marginTop: 20, justifyContent: 'center' }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine1, width: 8, height: 8 }]} />
              <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>MAU</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine2, width: 8, height: 8 }]} />
              <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>DAU</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.orange, width: 8, height: 8 }]} />
              <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>Stickiness (%)</Text>
            </View>
          </View>
        </View>


        {/* Push Properties (Donut Chart) */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface, marginBottom: 30, flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.chartTitle, { color: colors.text, marginBottom: 20 }]}>{t('dashboard.pushDistribution')}</Text>
            <View style={styles.legendRowVertical}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.chartLine1 }]} />
                <View>
                  <Text style={[styles.legendTextBig, { color: colors.text }]}>{formatNum(latest?.pushOptInIos || 0)}</Text>
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>iOS Users</Text>
                </View>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.chartLine2 }]} />
                <View>
                  <Text style={[styles.legendTextBig, { color: colors.text }]}>{formatNum(latest?.pushOptInAndroid || 0)}</Text>
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Android Users</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <PieChart
              donut
              innerRadius={45}
              radius={70}
              data={pushPieData}
              centerLabelComponent={() => (
                <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, color: colors.text, fontWeight: 'bold' }}>
                    {formatNum((latest?.pushOptInIos || 0) + (latest?.pushOptInAndroid || 0))}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>Total</Text>
                </View>
              )}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  header: { fontSize: 24, fontWeight: '800', marginTop: 16, marginBottom: 20 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
  cardsRow: { marginBottom: 24 },
  cardsContent: { gap: 12, paddingRight: 20 },
  fancyCard: {
    width: 140,
    padding: 18,
    borderRadius: 24,
    justifyContent: 'space-between',
  },
  fancyCardLabel: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.9, marginBottom: 16 },
  fancyCardValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  fancyCardChange: { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.9 },
  chartCard: {
    borderRadius: 30,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  chartTitle: { fontSize: 18, fontWeight: '700' },
  chartCardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, minHeight: 40 },
  staticTooltip: { alignItems: 'flex-end' },
  tooltipDate: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  tooltipTitleValue: { fontSize: 17, fontWeight: '800' },
  tooltipChange: { fontSize: 13, fontWeight: '700' },
  legendRowVertical: { gap: 20 },
  legendRowHorizontal: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendTextBig: { fontSize: 16, fontWeight: '800' },
  legendText: { fontSize: 11, marginTop: 2 },
});
