import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card, Typography, Row, Col, Descriptions, Table, Tag, Spin, Alert, Statistic, Divider, Space, Empty } from 'antd';
import { BarChartOutlined, FileTextOutlined, NumberOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { DbFileContent } from '@/shared/types';

const { Title, Text, Paragraph } = Typography;

// Helper to format combo array for display
const formatCombo = (combo: number[]) => combo.map(n => String(n).padStart(2, '0')).join(', ');

const ResultPage: React.FC = () => {
  const { filename: paramFilename } = useParams<{ filename?: string }>(); // Get filename from URL param if used
  const location = useLocation(); // Access location state if passed via navigation

  const [resultData, setResultData] = useState<DbFileContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayFilename, setDisplayFilename] = useState<string | null>(paramFilename || null);

  useEffect(() => {
    // Attempt to load data based on URL parameter or potentially passed state
    // For now, this component is mostly a placeholder as the 'Last Result' link
    // in App.tsx doesn't pass specific data yet.
    // We'll add logic to fetch data based on 'displayFilename' when the
    // DbManager page is implemented and can navigate here with a filename.

    // Load data if a filename is present
    if (displayFilename) {
      const fetchResult = async () => {
        setIsLoading(true);
        setError(null);
        setResultData(null); // Clear previous results
        try {
          if (window.electronAPI) {
            console.log(`ResultPage: Fetching content for ${displayFilename}`); // Added log
            const data: DbFileContent = await window.electronAPI.invoke('get-db-content', displayFilename); // Corrected IPC call and uncommented
            console.log(`ResultPage: Received data for ${displayFilename}`, data); // Added log
            setResultData(data);
          } else {
            throw new Error("Electron API not available.");
          }
        } catch (err: any) {
          console.error(`ResultPage: Error loading ${displayFilename}`, err); // Added log
          setError(`Failed to load result for ${displayFilename}: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      };
      fetchResult();
    } else {
      // If no filename, maybe load the most recent result? Or show message.
      setError("No specific result file selected to display.");
      setResultData(null); // Ensure no old data is shown
    }

  }, [displayFilename]); // Re-run effect if the filename changes

  // 定义表格列配置
  const columns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 80,
    },
    {
      title: '组合',
      dataIndex: 'combo',
      key: 'combo',
      render: (text: string) => (
        <Text code copyable>
          {text}
        </Text>
      ),
    },
  ];

  // 准备表格数据
  const tableData = resultData
    ? resultData.combos.map((combo, index) => ({
      key: index,
      index: index + 1,
      combo: formatCombo(combo),
    }))
    : [];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            variant="borderless"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <Title level={2}>
              <BarChartOutlined /> 结果详情
            </Title>
            <Paragraph>
              查看算法计算的详细结果，包括参数配置和生成的最优组合。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {isLoading && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card variant="borderless">
              <Spin tip="加载中...">
                <div style={{ padding: '50px 0', textAlign: 'center' }}>
                  <Paragraph>正在加载结果数据，请稍候...</Paragraph>
                </div>
              </Spin>
            </Card>
          </Col>
        </Row>
      )}

      {error && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Alert
              message="加载错误"
              description={error}
              type="error"
              showIcon
            />
          </Col>
        </Row>
      )}

      {!isLoading && !error && !resultData && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card variant="borderless">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    请从<Text strong>「结果管理」</Text>页面选择一个结果文件查看详情
                  </span>
                }
              />
            </Card>
          </Col>
        </Row>
      )}

      {resultData && (
        <>
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>参数配置</span>
                  </Space>
                }
                variant="borderless"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              >
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={16}>
                    <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                      <Descriptions.Item label="文件名">{displayFilename || '未命名结果'}</Descriptions.Item>
                      <Descriptions.Item label="M值">{resultData.m}</Descriptions.Item>
                      <Descriptions.Item label="N值">{resultData.n}</Descriptions.Item>
                      <Descriptions.Item label="K值">{resultData.k}</Descriptions.Item>
                      <Descriptions.Item label="J值">{resultData.j}</Descriptions.Item>
                      <Descriptions.Item label="S值">{resultData.s}</Descriptions.Item>
                    </Descriptions>

                    <Divider orientation="left">输入样本</Divider>
                    <div>
                      {resultData.samples.map((sample, index) => (
                        <Tag color="blue" key={index} style={{ margin: '0 4px 4px 0' }}>
                          {String(sample).padStart(2, '0')}
                        </Tag>
                      ))}
                    </div>
                  </Col>

                  <Col xs={24} md={8}>
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Statistic
                          title="样本数量"
                          value={resultData.samples.length}
                          prefix={<NumberOutlined />}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="组合数量"
                          value={resultData.combos.length}
                          prefix={<CheckCircleOutlined />}
                          valueStyle={{ color: '#3f8600' }}
                        />
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card
                title={
                  <Space>
                    <BarChartOutlined />
                    <span>生成的最优组合 ({resultData.combos.length})</span>
                  </Space>
                }
                variant="borderless"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              >
                {resultData.combos.length > 0 ? (
                  <Table
                    columns={columns}
                    dataSource={tableData}
                    pagination={{
                      hideOnSinglePage: tableData.length <= 10,
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (total) => `共 ${total} 条记录`,
                    }}
                    size="middle"
                    scroll={{ y: 400 }}
                  />
                ) : (
                  <Empty description="没有找到组合结果" />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default ResultPage;
