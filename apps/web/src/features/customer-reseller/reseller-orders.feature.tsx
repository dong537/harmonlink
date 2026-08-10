import React from 'react';
import { Alert, Button, Card, Col, Input, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, ReloadOutlined, ShopOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { buildQuery, userApiRequest } from '../../shared/api/client';
import { ListPage } from '../../shared/ui/list-page';
import { PageHeader } from '../../shared/ui/page-header';
import { formatDateTime } from '../../shared/time/time';
import { formatMoneyAmount } from '../../shared/money/money';
import { orderStatusColor } from '../../shared/order/order-labels';
import { formatResourceLocationZh } from '../../shared/resource/resource-labels';
import { getBackendReason, resellerCompactInputStyle, resellerCompactSelectStyle, resellerHeroStyle, resellerIconStyle, resellerMetricBodyStyle, resellerMetricToneStyle, resellerSummaryStripStyle, resellerToolbarFiltersStyle, resellerToolbarStyle, resellerWorkspaceHeaderStyle } from './reseller-ui';

interface ResellerOrder {
  id: string;
  userId: string;
  user?: { email?: string };
  resource?: { code?: string; name?: string; displayName?: string | null; countryCode?: string | null; upstreamResourceId?: string | null };
  type: string;
  status: string;
  quantity: number;
  durationDays: number;
  totalPrice: string;
  currency: string;
  createdAt: string;
  updatedAt?: string | null;
}

export function ResellerOrdersFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [status, setStatus] = React.useState<string | undefined>();
  const [userId, setUserId] = React.useState('');

  const query = useQuery({
    queryKey: ['customer-reseller-orders', page, pageSize, status, userId],
    queryFn: () => userApiRequest<{ page: number; pageSize: number; total: number; items: ResellerOrder[] }>(
      `/api/customer/reseller/orders${buildQuery({ page, pageSize, status, userId })}`,
    ),
  });

  const orderItems = query.data?.items ?? [];
  const completedCount = orderItems.filter((item) => item.status === 'COMPLETED').length;
  const pendingCount = orderItems.filter((item) => item.status === 'PENDING' || item.status === 'FULFILLING').length;
  const failedCount = orderItems.filter((item) => item.status === 'FAILED' || item.status === 'REFUNDED').length;
  const hasActiveFilters = Boolean(status || userId);

  const columns: ColumnsType<ResellerOrder> = [
    {
      title: t('customer.reseller.orders.orderNo'),
      dataIndex: 'id',
      key: 'id',
      width: 220,
      render: (value: string, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text copyable>{value}</Typography.Text>
          <Tag>{formatOrderType(row.type)}</Tag>
        </Space>
      ),
    },
    {
      title: t('customer.reseller.orders.user'),
      key: 'user',
      width: 240,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{row.user?.email ?? t('customer.reseller.orders.unknownUser')}</Typography.Text>
          <Typography.Text type="secondary" copyable style={{ fontSize: 12 }}>{row.userId}</Typography.Text>
          <Tag color="blue">{t('customer.reseller.orders.resellerUser')}</Tag>
        </Space>
      ),
    },
    {
      title: t('customer.reseller.orders.product'),
      key: 'resource',
      width: 280,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{formatOrderResource(row)}</Typography.Text>
          {row.resource?.code && (
            <Typography.Text type="secondary" copyable={{ text: row.resource.code }} style={{ fontSize: 12 }}>
              {compactTraceValue(row.resource.code, 20)}
            </Typography.Text>
          )}
          <Space size={6} wrap>
            <Tag color="geekblue">{t('customer.reseller.products.mainSite')}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: t('customer.reseller.orders.status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (v: string) => <Tag color={orderStatusColor(v)}>{formatOrderStatus(t, v)}</Tag>,
    },
    {
      title: t('customer.reseller.orders.spec'),
      key: 'spec',
      width: 130,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{t('customer.reseller.orders.quantityValue', { count: row.quantity })}</Typography.Text>
          <Typography.Text type="secondary">{t('customer.reseller.orders.durationValue', { days: row.durationDays })}</Typography.Text>
        </Space>
      ),
    },
    { title: t('customer.reseller.orders.amount'), key: 'amount', width: 150, render: (_: unknown, row) => formatMoneyAmount(row.totalPrice, row.currency) ?? '-' },
    {
      title: t('customer.reseller.orders.time'),
      key: 'time',
      width: 210,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{formatDateTime(row.createdAt)}</Typography.Text>
          {row.updatedAt && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(row.updatedAt)}</Typography.Text>}
        </Space>
      ),
    },
  ];

  return (
    <div className="ipx-reseller-page ipx-reseller-orders-page">
      <PageHeader
        kicker={t('customer.reseller.kicker')}
        title={t('customer.reseller.orders.title')}
        description={t('customer.reseller.orders.description')}
      />
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="ipx-reseller-hero ipx-reseller-orders-hero ipx-reseller-management-hero" variant="borderless" style={resellerHeroStyle()}>
        <Space align="start" size={14} style={resellerWorkspaceHeaderStyle}>
          <Space align="start" size={14}>
            <span className="ipx-reseller-management-icon" style={resellerIconStyle}><FileTextOutlined /></span>
            <Space direction="vertical" size={4}>
              <Typography.Text strong>{t('customer.reseller.orders.workspaceTitle')}</Typography.Text>
              <Typography.Text type="secondary">{t('customer.reseller.orders.workspaceDesc')}</Typography.Text>
              <Space size={6} wrap>
                <Tag color="blue">{t('customer.reseller.orders.realOrderSource')}</Tag>
                <Tag color="geekblue">{t('customer.reseller.orders.fulfillmentSource')}</Tag>
              </Space>
            </Space>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => navigate({ to: '/reseller/users' as never })}>
              {t('customer.reseller.cards.users')}
            </Button>
            <Button icon={<ShopOutlined />} onClick={() => navigate({ to: '/reseller/products' as never })}>
              {t('customer.reseller.cards.products')}
            </Button>
          </Space>
          </Space>
        </Card>
      <div style={resellerSummaryStripStyle}>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="ipx-reseller-metric-card ipx-reseller-orders-metric-card ipx-reseller-management-metric-card" variant="borderless" style={resellerMetricToneStyle('#315cff')} styles={resellerMetricBodyStyle}>
            <Statistic title={t('customer.reseller.orders.metrics.total')} value={query.data?.total ?? '-'} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="ipx-reseller-metric-card ipx-reseller-orders-metric-card ipx-reseller-management-metric-card" variant="borderless" style={resellerMetricToneStyle('#16a34a')} styles={resellerMetricBodyStyle}>
            <Statistic title={t('customer.reseller.orders.metrics.completed')} value={query.data ? completedCount : '-'} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="ipx-reseller-metric-card ipx-reseller-orders-metric-card ipx-reseller-management-metric-card" variant="borderless" style={resellerMetricToneStyle('#f59e0b')} styles={resellerMetricBodyStyle}>
            <Statistic title={t('customer.reseller.orders.metrics.pending')} value={query.data ? pendingCount : '-'} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="ipx-reseller-metric-card ipx-reseller-orders-metric-card ipx-reseller-management-metric-card" variant="borderless" style={resellerMetricToneStyle('#dc2626')} styles={resellerMetricBodyStyle}>
            <Statistic title={t('customer.reseller.orders.metrics.failed')} value={query.data ? failedCount : '-'} prefix={<WarningOutlined />} />
          </Card>
        </Col>
      </Row>
      </div>
      <Alert
        type="info"
        showIcon
        message={t('customer.reseller.orders.sourceTruth')}
      />
      {query.isFetching && !query.isLoading && (
        <Alert type="info" showIcon message={t('customer.reseller.orders.refreshing')} />
      )}
      {query.data && orderItems.length === 0 && hasActiveFilters && (
        <Alert
          type="warning"
          showIcon
          message={t('customer.reseller.orders.filteredEmpty')}
          description={t('customer.reseller.orders.filteredEmptyDesc')}
        />
      )}
      <div className="ipx-reseller-table-card ipx-reseller-orders-table-card">
        <ListPage
          query={query}
          columns={columns}
          rowKey="id"
          emptyText={t('customer.reseller.orders.empty')}
          errorDescription={(error) => getBackendReason(error, t)}
          toolbar={(
            <div className="ipx-reseller-toolbar ipx-reseller-orders-toolbar ipx-reseller-management-toolbar" style={resellerToolbarStyle}>
              <div style={resellerToolbarFiltersStyle}>
              <Input
                placeholder={t('customer.reseller.orders.userIdFilter')}
                allowClear
                size="middle"
                style={resellerCompactInputStyle}
                onChange={(event) => { setUserId(event.target.value.trim()); setPage(1); }}
              />
              <Select
                placeholder={t('customer.reseller.orders.statusFilter')}
                allowClear
                size="middle"
                style={resellerCompactSelectStyle}
                onChange={(value) => { setStatus(value); setPage(1); }}
                options={['PENDING', 'FULFILLING', 'COMPLETED', 'FAILED', 'REFUNDED'].map((value) => ({ value, label: formatOrderStatus(t, value) }))}
              />
              </div>
              <Space size={8} wrap>
                {status ? <Tag color="processing">{t('customer.reseller.orders.summary.statusFilter', { status: formatOrderStatus(t, status) })}</Tag> : null}
                {userId ? <Tag color="purple">{t('customer.reseller.orders.summary.userFilter', { userId })}</Tag> : null}
                <Tag color="blue">{t('customer.reseller.orders.summary.total', { total: query.data?.total ?? 0 })}</Tag>
                <Tag color="geekblue">{t('customer.reseller.orders.summary.source')}</Tag>
                <Tag>{t('customer.reseller.orders.summary.currentPage', { count: orderItems.length })}</Tag>
                <Tag color={pendingCount > 0 ? 'processing' : undefined}>{t('customer.reseller.orders.summary.pendingOnPage', { count: pendingCount })}</Tag>
                <Tag color="green">{t('customer.reseller.orders.summary.completedOnPage', { count: completedCount })}</Tag>
                <Tag color={failedCount > 0 ? 'red' : undefined}>{t('customer.reseller.orders.summary.failedOnPage', { count: failedCount })}</Tag>
                <Button icon={<ReloadOutlined />} onClick={() => query.refetch()} loading={query.isFetching}>{t('refresh')}</Button>
              </Space>
            </div>
          )}
          pagination={{
            page,
            pageSize,
            total: query.data?.total ?? 0,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </div>
      </Space>
    </div>
  );
}

function formatOrderResource(row: ResellerOrder): string {
  if (!row.resource) return '-';
  return formatResourceLocationZh(row.resource).title;
}

function formatOrderType(type: string): string {
  if (type === 'STATIC_PROXY') return '静态代理';
  if (type === 'RESIDENTIAL_PROXY') return '住宅代理';
  if (type === 'PROXY') return '代理服务';
  return '代理订单';
}

function compactTraceValue(value: string, visibleChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= visibleChars) return trimmed;
  return `${trimmed.slice(0, visibleChars)}...`;
}

function formatOrderStatus(t: (key: string) => string, status: string): string {
  if (status === 'PENDING') return t('customer.reseller.status.pending');
  if (status === 'FULFILLING') return t('customer.reseller.status.fulfilling');
  if (status === 'COMPLETED') return t('customer.reseller.status.completed');
  if (status === 'FAILED') return t('customer.reseller.status.failed');
  if (status === 'REFUNDED') return t('customer.reseller.status.refunded');
  return status;
}
