import { useKPI } from '@/context/kpi-context';
import { useScrollToTopListener } from '@/context/scroll-to-top-context';
import { useThemeContext } from '@/context/theme-context';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart, PieChart, yAxisSides } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';
import { useState } from 'react';

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
  // Support both DD.MM.YYYY and MM.YYYY formats
  if (parts.length === 3) {
    const month = parts[1];
    const year = parts[2].substring(2);
    const months: Record<string, string> = {
      '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis',
      '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu',
      '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara'
    };
    const mStr = months[month] || '';
    return `${mStr}${year}`;
  }
  if (parts.length === 2) {
    // MM.YYYY
    const month = parts[0];
    const year = parts[1].substring(2);
    const months: Record<string, string> = {
      '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis',
      '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu',
      '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara'
    };
    const mStr = months[month] || '';
    return `${mStr}${year}`;
  }
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

  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  useScrollToTopListener('index', scrollToTop);

  const latest = computed.length > 0 ? computed[computed.length - 1] : null;
  const lastHapticRef = useRef<string | null>(null);
  const [isChartBusy, setIsChartBusy] = useState(false);

  // --- Total Devices Card State ---
  const availableYears = useMemo(() => {
    const years = new Set(computed.map(e => {
      const parts = e.date.split('.');
      return parts.length === 3 ? parts[2] : parts.length === 2 ? parts[1] : '';
    }).filter(Boolean));
    return Array.from(years).sort();
  }, [computed]);

  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const activeYear = useMemo(() => {
    if (selectedYear) return selectedYear;
    return availableYears[availableYears.length - 1] || null;
  }, [selectedYear, availableYears]);

  const yearFiltered = useMemo(() => {
    if (!activeYear) return computed;
    return computed.filter(e => {
      const parts = e.date.split('.');
      const year = parts.length === 3 ? parts[2] : parts.length === 2 ? parts[1] : '';
      return year === activeYear;
    });
  }, [computed, activeYear]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);

  const activeMonthEntry = useMemo(() => {
    if (selectedMonthIdx !== null && yearFiltered[selectedMonthIdx]) {
      return yearFiltered[selectedMonthIdx];
    }
    return yearFiltered[yearFiltered.length - 1] || null;
  }, [selectedMonthIdx, yearFiltered]);

  const iosTotal = activeMonthEntry?.downloadIos || 0;
  const androidTotal = activeMonthEntry?.downloadAndroid || 0;
  const deviceTotal = iosTotal + androidTotal;
  const iosRatio = deviceTotal > 0 ? iosTotal / deviceTotal : 0.5;
  const deviceChange = activeMonthEntry?.downloadChange ?? null;

  const [pressedBar, setPressedBar] = useState<'ios' | 'android' | null>(null);

  const deviceCardTitle = pressedBar === 'ios' ? 'iOS' : pressedBar === 'android' ? 'Android' : t('dashboard.totalDownloads');
  const deviceCardNum = pressedBar === 'ios' ? iosTotal : pressedBar === 'android' ? androidTotal : deviceTotal;
  const deviceCardChange = pressedBar === 'ios'
    ? (activeMonthEntry && computed.indexOf(activeMonthEntry) > 0
      ? (() => { const prev = computed[computed.indexOf(activeMonthEntry) - 1]; return prev.downloadIos > 0 ? ((iosTotal - prev.downloadIos) / prev.downloadIos) * 100 : null; })()
      : null)
    : pressedBar === 'android'
      ? (activeMonthEntry && computed.indexOf(activeMonthEntry) > 0
        ? (() => { const prev = computed[computed.indexOf(activeMonthEntry) - 1]; return prev.downloadAndroid > 0 ? ((androidTotal - prev.downloadAndroid) / prev.downloadAndroid) * 100 : null; })()
        : null)
      : deviceChange;

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
        label: t('dashboard.stickiness'),
        value: latest.stickiness.toFixed(1) + '%',
        change: latest.stickinessChange,
        color: colors.orange,
      },
    ];
  }, [latest, colors, t]);

  const lastUpdateLabel = useMemo(() => {
    if (!latest) return null;
    const parts = latest.date.split('.');
    const monthNum = parts.length === 3 ? parts[1] : parts.length === 2 ? parts[0] : null;
    const year = parts.length === 3 ? parts[2] : parts.length === 2 ? parts[1] : null;
    if (!monthNum || !year) return null;
    const monthNames: Record<string, string> = {
      '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
      '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
      '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    };
    return `Son Güncelleme: ${monthNames[monthNum] || monthNum} ${year}`;
  }, [latest]);

  const [activeUser, setActiveUser] = useState<any>(null);

  const usersPointerComponent = (items: any) => {
    return <TooltipTracker item={items[0]} onUpdate={setActiveUser} />;
  };

  const [activeEngagement, setActiveEngagement] = useState<any>(null);
  const engagementPointerComponent = (items: any) => {
    return <TooltipTracker item={items[0]} onUpdate={setActiveEngagement} />;
  };

  const stickinessActivePointer = () => (
    <View style={{
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: '#FFFFFF',
      borderWidth: 3, borderColor: colors.orange,
    }} />
  );


  const mauDauBarData = useMemo(() => {
    const arr: any[] = [];
    computed.forEach((e) => {
      arr.push({
        value: e.mau,
        frontColor: colors.chartLine1,
        labelComponent: () => (
          <Text style={{ width: 40, textAlign: 'center', fontSize: 11, color: colors.textTertiary, marginLeft: 0, marginTop: 12, fontWeight: '600' }}>
            {shortDate(e.date)}
          </Text>
        ),
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
      stickinessChange: e.stickinessChange,
      dataPointColor: colors.orange,
    }));
  }, [computed, colors]);

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
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        directionalLockEnabled={true}
      >
        <Text style={[styles.header, { color: colors.text }]}>{t('dashboard.title')}</Text>

        {/* Last Update Label */}
        {lastUpdateLabel && (
          <Text style={[styles.lastUpdateLabel, { color: colors.textTertiary }]}>{lastUpdateLabel}</Text>
        )}

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

          {/* MAU / DAU Split Card */}
          {latest && (
            <View style={[styles.fancyCard, styles.fancyCardWide, { backgroundColor: colors.blue }]}>
              {/* MAU side */}
              <View style={styles.splitCardSide}>
                <Text style={styles.fancyCardLabel}>MAU</Text>
                <Text style={styles.fancyCardValue}>{formatNum(latest.mau)}</Text>
                {latest.mauChange !== null && (
                  <Text style={styles.fancyCardChange}>
                    {latest.mauChange >= 0 ? '↑' : '↓'} {Math.abs(latest.mauChange).toFixed(2)}%
                  </Text>
                )}
              </View>
              {/* Divider */}
              <View style={styles.splitCardDivider} />
              {/* DAU side */}
              <View style={styles.splitCardSide}>
                <Text style={styles.fancyCardLabel}>DAU</Text>
                <Text style={styles.fancyCardValue}>{formatNum(latest.dau)}</Text>
                {latest.dauChange !== null && (
                  <Text style={styles.fancyCardChange}>
                    {latest.dauChange >= 0 ? '↑' : '↓'} {Math.abs(latest.dauChange).toFixed(2)}%
                  </Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Total Devices Card - New Design */}
        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          {/* Header: Title + Year Selector */}
          <View style={styles.chartCardHeaderRow}>
            <Text style={[styles.chartTitle, { color: pressedBar ? colors.textSecondary : colors.text }]}>
              {deviceCardTitle}
            </Text>
            <View style={[styles.yearPill, { backgroundColor: colors.surfaceSecondary }]}>
              {availableYears.map(year => (
                <TouchableOpacity
                  key={year}
                  onPress={() => { setSelectedYear(year); setSelectedMonthIdx(null); }}
                  style={[
                    styles.yearPillItem,
                    activeYear === year && { backgroundColor: colors.surface }
                  ]}
                >
                  <Text style={[
                    styles.yearPillText,
                    { color: activeYear === year ? colors.text : colors.textTertiary },
                    activeYear === year && { fontWeight: '800' }
                  ]}>{year}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Big Number + Change Badge */}
          <View style={styles.devicesTotalRow}>
            <Text style={[styles.devicesTotalNum, { color: pressedBar === 'ios' ? colors.chartLine1 : pressedBar === 'android' ? colors.chartLine2 : colors.text }]}>
              {formatNum(deviceCardNum)}
            </Text>
            {deviceCardChange !== null && (
              <View style={[styles.changeBadge, { backgroundColor: deviceCardChange >= 0 ? colors.greenLight : colors.redLight }]}>
                <Text style={[styles.changeBadgeText, { color: deviceCardChange >= 0 ? colors.green : colors.red }]}>
                  {deviceCardChange >= 0 ? '↑' : '↓'} {Math.abs(deviceCardChange).toFixed(2)}%
                </Text>
              </View>
            )}
          </View>

          {/* Stacked Progress Bar */}
          <View style={styles.stackedBarContainer}>
            <Pressable
              style={[
                styles.stackedBarIos,
                { backgroundColor: colors.chartLine1, flex: iosRatio, opacity: pressedBar === 'android' ? 0.35 : 1 }
              ]}
              onPressIn={() => {
                setPressedBar('ios');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              onPressOut={() => {
                setPressedBar(null);
                Haptics.selectionAsync();
              }}
            />
            <Pressable
              style={[
                styles.stackedBarAndroid,
                { backgroundColor: colors.chartLine2, flex: 1 - iosRatio, opacity: pressedBar === 'ios' ? 0.35 : 1 }
              ]}
              onPressIn={() => {
                setPressedBar('android');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              onPressOut={() => {
                setPressedBar(null);
                Haptics.selectionAsync();
              }}
            />
          </View>

          {/* Legend */}
          <View style={[styles.legendRowHorizontal, { marginTop: 12, marginBottom: 20 }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine1, borderRadius: 3 }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>iOS</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.chartLine2, borderRadius: 3 }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Android</Text>
            </View>
          </View>

          {/* Month Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            <View style={styles.monthChipsRow}>
              {yearFiltered.map((entry, idx) => {
                const isActive = activeMonthEntry?.date === entry.date;
                return (
                  <TouchableOpacity
                    key={entry.date}
                    onPress={() => setSelectedMonthIdx(idx)}
                    style={[
                      styles.monthChip,
                      { backgroundColor: isActive ? colors.accent : colors.surfaceSecondary }
                    ]}
                  >
                    <Text style={[
                      styles.monthChipText,
                      { color: isActive ? '#fff' : colors.text }
                    ]}>{shortDate(entry.date)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
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
          <View style={[styles.chartCardHeaderRow, { alignItems: 'flex-start' }]}>
            <Text style={[styles.chartTitle, { color: colors.text, flex: 1, marginTop: -2 }]}>{t('dashboard.engagementTrend', 'Engagement Trend')}</Text>
            {activeEngagement && (
              <View style={styles.staticTooltip}>
                <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{activeEngagement.dateFull}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.tooltipTitleValue, { color: colors.text }]}>Stck: {activeEngagement.stickiness.toFixed(2)}%</Text>
                  {activeEngagement.stickinessChange !== null && activeEngagement.stickinessChange !== undefined && (
                    <Text style={[styles.tooltipChange, { color: activeEngagement.stickinessChange >= 0 ? colors.green : colors.red }]}>
                      {formatPct(activeEngagement.stickinessChange)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.tooltipDate, { color: colors.textTertiary, marginTop: 4, fontSize: 10 }]}>
                  MAU: {formatNum(activeEngagement.mau)} · DAU: {formatNum(activeEngagement.dau)}
                </Text>
              </View>
            )}
          </View>
          {/* Sticky Y-axis + scrollable chart */}
          <View style={{ flexDirection: 'row' }}>
            {/* Fixed left Y-axis labels */}
            <View style={{ width: 45, height: 180, justifyContent: 'space-between', paddingBottom: 0 }}>
              {[maxMauDau, maxMauDau * 0.75, maxMauDau * 0.5, maxMauDau * 0.25, 0].map((val, i) => (
                <Text key={i} style={{ color: colors.textTertiary, fontSize: 10, textAlign: 'right', paddingRight: 6 }}>
                  {formatNum(val)}
                </Text>
              ))}
            </View>
            {/* Scrollable chart area */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              style={{ flex: 1 }}
            >
              <View style={{ width: comboWidth, paddingBottom: 16 }}>
                <View style={{ opacity: 0.6 }}>
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
                    hideYAxisText
                    yAxisLabelWidth={0}
                    isAnimated
                  />
                </View>
                <View style={{ position: 'absolute', top: 0, left: 0, width: comboWidth, height: 180 }}>
                  <LineChart
                    data={stickinessLineData}
                    maxValue={maxStickiness - minStickiness}
                    yAxisOffset={minStickiness}
                    stepValue={(maxStickiness - minStickiness) / 4}
                    width={comboWidth}
                    height={180}
                    yAxisSide={yAxisSides.RIGHT}
                    thickness={4}
                    color={colors.orange}
                    hideDataPoints={false}
                    dataPointsRadius={6}
                    hideRules
                    hideYAxisText={false}
                    yAxisTextStyle={{ color: colors.textTertiary, fontSize: 10 }}
                    hideAxesAndRules
                    initialSpacing={40}
                    spacing={72}
                    isAnimated
                    pointerConfig={{
                      pointerStripHeight: 180,
                      pointerStripColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      pointerStripWidth: 2,
                      pointerComponent: stickinessActivePointer,
                      radius: 8,
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

          </View>
          <View style={[styles.legendRowHorizontal, { marginTop: 8, justifyContent: 'center' }]}>
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
              innerCircleColor={colors.surface}
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
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
  lastUpdateLabel: { fontSize: 11, fontWeight: '500', marginBottom: 10, marginTop: -12 },
  fancyCardLabel: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.9, marginBottom: 16 },
  fancyCardValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  fancyCardChange: { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.9 },
  fancyCardWide: { width: 210, flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  splitCardSide: { flex: 1, alignItems: 'center' },
  splitCardDivider: { width: 1, height: '70%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
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
  chartCardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, minHeight: 40 },
  staticTooltip: { alignItems: 'flex-end' },
  tooltipDate: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  tooltipTitleValue: { fontSize: 17, fontWeight: '800' },
  tooltipChange: { fontSize: 13, fontWeight: '700' },
  legendRowVertical: { gap: 20 },
  legendRowHorizontal: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendTextBig: { fontSize: 16, fontWeight: '800' },
  legendText: { fontSize: 12, fontWeight: '500' },
  // Total Devices Card
  yearPill: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  yearPillItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  yearPillText: { fontSize: 14, fontWeight: '600' },
  devicesTotalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: -8,
  },
  devicesTotalNum: { fontSize: 48, fontWeight: '900', lineHeight: 54 },
  changeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 6,
  },
  changeBadgeText: { fontSize: 14, fontWeight: '700' },
  stackedBarContainer: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
    gap: 2,
  },
  stackedBarIos: { borderRadius: 10 },
  stackedBarAndroid: { borderRadius: 10 },
  monthChipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4 },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  monthChipText: { fontSize: 14, fontWeight: '600' },
});

