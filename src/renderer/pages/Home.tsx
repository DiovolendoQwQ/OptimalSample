import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Progress, Alert, Typography, theme, Row, Col, Spin, Table, Space, Button, message, Popconfirm, Tooltip, Badge, Descriptions, Divider, Tag, Statistic } from 'antd';
import { ExperimentOutlined, DatabaseOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, FileExcelOutlined, FileTextOutlined, BarChartOutlined, NumberOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ParamForm from '../components/ParamForm';
import { AlgorithmParams, AlgorithmResult, ProgressUpdate, DbFileContent } from '@/shared/types';

const { Title, Text, Paragraph } = Typography;

// Type for the items in the dbFiles state array
interface DbFileListItem {
  filename: string;
  mtime: Date; // Keep mtime for sorting or other potential uses
  createdAt: Date; // Keep createdAt for potential display elsewhere
  execution_time?: string | number; // Add the optional execution time
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  if (k > n / 2) {
    k = n - k;
  }
  let res = 1;
  for (let i = 1; i <= k; ++i) {
    res = Math.round((res * (n - i + 1)) / i);
    if (!Number.isSafeInteger(res)) {
      console.warn("Binomial coefficient calculation might exceed safe integer limit for n=", n, "k=", k);
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return res;
}

const HomePage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  const [simulatedPercent, setSimulatedPercent] = useState<number>(0);
  // Update dbFiles state type to use the new interface
  const [dbFiles, setDbFiles] = useState<DbFileListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DbFileContent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchDbFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!window.electronAPI) {
        throw new Error("Electron API not available");
      }

      // Fetch files, now expecting the updated structure including execution_time
      const files: DbFileListItem[] = await window.electronAPI.invoke('list-db-files');
      console.log('Fetched files:', files); // Debug log

      if (!Array.isArray(files)) {
        throw new Error("Invalid response format from list-db-files");
      }

      // Files are already sorted by mtime from backend
      // Ensure dates are correctly parsed if they come as strings
      const processedFiles = files.map(file => ({
        ...file,
        mtime: new Date(file.mtime), // Ensure mtime is a Date object
        createdAt: new Date(file.createdAt) // Ensure createdAt is a Date object
      }));

      setDbFiles(processedFiles);

      // Auto-select first file if none selected and not already selected
      if (processedFiles.length > 0 && !selectedFile) {
        setSelectedFile(processedFiles[0].filename);
      } else if (processedFiles.length === 0) {
        setSelectedFile(null); // Clear selection if no files
      }
    } catch (err: any) {
      setError(`Failed to list database files: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFile]);

  useEffect(() => {
    fetchDbFiles();
  }, [fetchDbFiles]);

  // Load detail data when selected file changes
  useEffect(() => {
    if (!selectedFile) {
      setDetailData(null);
      return;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        if (window.electronAPI) {
          const data = await window.electronAPI.invoke('get-db-content', selectedFile);
          setDetailData(data);
        } else {
          throw new Error("Electron API not available.");
        }
      } catch (err: any) {
        setDetailError(`Failed to load details for ${selectedFile}: ${err.message}`);
        setDetailData(null);
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetail();
  }, [selectedFile]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onAlgorithmProgress((progressData: ProgressUpdate) => {
      console.log('[Renderer] Received algorithm-progress:', progressData);
      setProgressUpdate(progressData);
    });

    return () => {
      unsubscribe();
      stopSimulation();
    };
  }, [stopSimulation]);

  const handleDelete = useCallback(async (filename: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        await window.electronAPI.invoke('delete-db-file', filename);
        message.success(`Successfully deleted ${filename}`);
        await fetchDbFiles();
      } else {
        throw new Error("Electron API unavailable");
      }
    } catch (err: any) {
      console.error(`Error deleting ${filename} :`, err);
      message.error(`Deletion failed: ${err.message}`);
      setError(`Failed to delete ${filename} : ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDbFiles]);

  const handleView = (filename: string) => {
    navigate(`/results/${encodeURIComponent(filename)}`);
  };

  const handleFormSubmit = useCallback(async (params: AlgorithmParams) => {
    setIsSubmitting(true);
    setSubmissionStatus(null);
    setProgressUpdate({ percent: 0, message: 'Initializing calculation...' });
    setSimulatedPercent(0);
    stopSimulation();
    console.log('HomePage: Submitting params:', params);

    const numJSubsets = combinations(params.n, params.j);
    let simulationDuration = 5000;
    console.log(`Estimated j-subsets: ${numJSubsets}`);

    if (numJSubsets > 10000) {
      simulationDuration = 15000;
    } else if (numJSubsets > 1000) {
      simulationDuration = 8000;
    }

    const updatesPerSecond = 10;
    const increment = 90 / (simulationDuration / 1000 * updatesPerSecond);

    intervalRef.current = setInterval(() => {
      setSimulatedPercent(prev => {
        const next = prev + increment;
        if (next >= 90) {
          stopSimulation();
          return 90;
        }
        return next;
      });
    }, 1000 / updatesPerSecond);

    try {
      if (window.electronAPI) {
        const result: AlgorithmResult = await window.electronAPI.invoke('run-algorithm', params);

        stopSimulation();
        setSimulatedPercent(100);
        const execTime = result.execution_time ?? 'N/A';
        const workersUsed = result.workers ?? 'N/A';
        setProgressUpdate({ percent: 100, message: 'Calculation complete!' });
        console.log(`HomePage: Algorithm finished successfully. Execution time: ${execTime}s, Workers: ${workersUsed}`);
        setSubmissionStatus(`Success! Completed in ${execTime}s using ${workersUsed} worker(s).`);

        await fetchDbFiles();

        setTimeout(() => {
          setSubmissionStatus(null);
        }, 5000);
      } else {
        throw new Error("Electron API is not available. Preload script might have failed.");
      }
    } catch (error: any) {
      const errorMessage = error.message || 'An unknown error occurred.';
      setSubmissionStatus(`Error: ${errorMessage}`);
      setProgressUpdate({ percent: simulatedPercent, message: `Error: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}` });
      stopSimulation();
    } finally {
      setIsSubmitting(false);
    }
  }, [navigate]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            variant="borderless"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <Title level={2}>
              <ExperimentOutlined /> Optimal Sample Selection System
            </Title>
            <Paragraph>
              Enter the parameters and select samples to generate the optimal combination.
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {isSubmitting && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card variant="borderless" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Spin spinning={true} tip="Processing...">
                <div style={{ padding: '20px 0' }}>
                  <Progress
                    percent={Math.round(simulatedPercent)}
                    status="active"
                    strokeColor={{
                      '0%': token.colorPrimary,
                      '100%': token.colorSuccess,
                    }}
                  />
                  <Paragraph style={{ marginTop: 16 }}>
                    {progressUpdate?.message || 'Initializing...'}
                  </Paragraph>
                  {progressUpdate?.elapsed_time && (
                    <Text type="secondary">
                      Elapsed time: {progressUpdate.elapsed_time.toFixed(1)} seconds
                    </Text>
                  )}
                </div>
              </Spin>
            </Card>
          </Col>
        </Row>
      )}

      {submissionStatus && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Alert
              message={submissionStatus.startsWith('Error') ? 'error' : 'success'}
              description={submissionStatus}
              type={submissionStatus.startsWith('Error') ? 'error' : 'success'}
              showIcon
            />
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <ParamForm onSubmit={handleFormSubmit} isSubmitting={isSubmitting} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            variant="borderless"
            title={
              <Space>
                <Badge status="processing" />
                <span>Saved Results</span>
                <Badge count={dbFiles.length} style={{ backgroundColor: '#52c41a' }} />
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={fetchDbFiles}
                loading={isLoading}
              >
                Refresh List
              </Button>
            }
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            {error && (
              <Paragraph type="danger" style={{ marginBottom: 16 }}>
                {error}
              </Paragraph>
            )}

            <Table
              columns={[
                {
                  title: 'File Name',
                  dataIndex: 'filename',
                  key: 'filename',
                  render: (text: string) => (
                    <Text strong ellipsis={{ tooltip: text }}>
                      {text}
                    </Text>
                  ),
                },
                {
                  title: 'Execution Time (s)', // Change column title
                  dataIndex: 'execution_time', // Use the new data index
                  key: 'execution_time',
                  width: 150, // Adjust width if needed
                  render: (time: string | number | undefined) => {
                    let displayTime: string;
                    if (typeof time === 'number') {
                      displayTime = time.toFixed(3); // Format number to 3 decimal places
                    } else if (typeof time === 'string') {
                      // Attempt to parse string as float, format if successful
                      const numTime = parseFloat(time);
                      displayTime = isNaN(numTime) ? 'N/A' : numTime.toFixed(3);
                    } else {
                      displayTime = 'N/A'; // Handle undefined case
                    }
                    return <Text type="secondary">{displayTime}</Text>;
                  },
                },
                {
                  title: 'Action',
                  key: 'action',
                  width: 150,
                  render: (_: any, record: { filename: string }) => (
                    <Space size="small">
                      <Tooltip title="View Details">
                        <Button
                          type="text"
                          icon={<EyeOutlined />}
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleView(record.filename);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Export Excel">
                        <Button
                          icon={<FileExcelOutlined />}
                          size="small"
                          onClick={async () => {
                            message.loading({ content: `Exporting ${record.filename}...`, key: 'exporting' });
                            try {
                              if (window.electronAPI) {
                                const result = await window.electronAPI.invoke('export-db-to-excel', record.filename);
                                if (result.success) {
                                  message.success({ content: result.message, key: 'exporting', duration: 5 });
                                } else {
                                  message.error({ content: result.message || 'Export failed', key: 'exporting', duration: 5 });
                                }
                              } else {
                                throw new Error("Electron API unavailable");
                              }
                            } catch (err: any) {
                              message.error({ content: `Export error: ${err.message}`, key: 'exporting', duration: 5 });
                            }
                          }}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="Are you sure you want to delete this result file？"
                        description="This action cannot be undone！"
                        onConfirm={() => handleDelete(record.filename)}
                        okText="Confirm"
                        cancelText="Cancel"
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                        />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
              // Update dataSource mapping to include execution_time
              dataSource={dbFiles.map((file, index) => ({
                key: index, // Use index as key, or ideally a unique ID if available
                filename: file.filename,
                execution_time: file.execution_time, // Pass execution_time to the row data
                // createdAt: file.createdAt.toLocaleString(), // Keep if needed elsewhere, but not for the main display column
              }))}
              loading={isLoading}
              pagination={false} // Consider adding pagination if list can grow large
              locale={{
                emptyText: 'No saved result files found',
              }}
              size="middle"
              rowKey="key"
              onRow={(record) => ({
                onClick: () => setSelectedFile(record.filename),
                style: { cursor: 'pointer' },
              })}
              rowClassName={(record) =>
                record.filename === selectedFile ? 'ant-table-row-selected' : ''
              }
            />
          </Card>
        </Col>
      </Row>

      {selectedFile && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title={
                <Space>
                  <FileTextOutlined />
                  <span>Result Detail - {selectedFile}</span>
                </Space>
              }
              loading={detailLoading}
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              {detailError && (
                <Alert type="error" showIcon message={detailError} />
              )}

              {detailData && (
                <>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={16}>
                      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                        <Descriptions.Item label="M">{detailData.m}</Descriptions.Item>
                        <Descriptions.Item label="N">{detailData.n}</Descriptions.Item>
                        <Descriptions.Item label="K">{detailData.k}</Descriptions.Item>
                        <Descriptions.Item label="J">{detailData.j}</Descriptions.Item>
                        <Descriptions.Item label="S">{detailData.s}</Descriptions.Item>
                        {detailData.execution_time && (
                          <Descriptions.Item label="Exec Time (s)">
                            {Number(detailData.execution_time).toFixed(3)}
                          </Descriptions.Item>
                        )}
                      </Descriptions>

                      <Divider orientation="left">Input Samples</Divider>
                      <div>
                        {detailData.samples.map((sample: number, index: number) => (
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
                            title="Number of Samples"
                            value={detailData.samples.length}
                            prefix={<NumberOutlined />}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="Number of Combinations"
                            value={detailData.combos.length}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#3f8600' }}
                          />
                        </Col>
                      </Row>
                    </Col>
                  </Row>

                  <Divider orientation="left" style={{ marginTop: 24 }}>
                    <Space>
                      <BarChartOutlined />
                      <span>Optimal Combinations ({detailData.combos.length})</span>
                    </Space>
                  </Divider>

                  <Table
                    columns={[
                      {
                        title: 'Index',
                        dataIndex: 'index',
                        key: 'index',
                        width: 80,
                      },
                      {
                        title: 'Combination',
                        dataIndex: 'combo',
                        key: 'combo',
                        render: (text: string) => (
                          <Text code copyable>
                            {text}
                          </Text>
                        ),
                      },
                    ]}
                    dataSource={detailData.combos.map((combo: number[], index: number) => ({
                      key: index,
                      index: index + 1,
                      combo: combo.map((n: number) => String(n).padStart(2, '0')).join(', '),
                    }))}
                    pagination={false}
                    size="middle"
                    scroll={{ y: 400 }}
                  />
                </>
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default HomePage;
