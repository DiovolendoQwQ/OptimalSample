import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Table, Space, Card, message, Popconfirm, Tooltip, Row, Col, Badge } from 'antd';
import { ReloadOutlined, EyeOutlined, DeleteOutlined, DatabaseOutlined, FileExcelOutlined } from '@ant-design/icons'; // Import FileExcelOutlined

const { Title, Text, Paragraph } = Typography;

const DbManagerPage: React.FC = () => {
  const [dbFiles, setDbFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null); // Feedback for delete actions
  const navigate = useNavigate();

  // Function to fetch the list of DB files
  const fetchDbFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setActionStatus(null); // Clear previous action status
    try {
      if (window.electronAPI) {
        const files = await window.electronAPI.invoke('list-db-files'); // Corrected IPC call
        setDbFiles(files.sort()); // Sort files for consistent display
      } else {
        throw new Error("Electron API not available.");
      }
    } catch (err: any) {
      setError(`Failed to list database files: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch files when the component mounts
  useEffect(() => {
    fetchDbFiles();
  }, [fetchDbFiles]);

  // 处理删除文件
  const handleDelete = useCallback(async (filename: string) => {
    setIsLoading(true);
    setError(null); // 清除之前的错误
    try {
      if (window.electronAPI) {
        await window.electronAPI.invoke('delete-db-file', filename);
        message.success(`成功删除 ${filename}`);
        // 刷新列表
        await fetchDbFiles();
      } else {
        throw new Error("Electron API 不可用");
      }
    } catch (err: any) {
      console.error(`删除 ${filename} 时出错:`, err);
      message.error(`删除失败: ${err.message}`);
      setError(`删除 ${filename} 失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDbFiles]);

  // Function to handle viewing a result (navigate to ResultPage)
  const handleView = (filename: string) => {
    // TODO: Implement navigation to ResultPage, possibly passing filename
    // This requires modifying ResultPage to load data based on the filename param
    console.log(`Navigating to view details for: ${filename}`);
    // Use navigate to go to the ResultPage with the filename as a URL parameter
    navigate(`/results/${encodeURIComponent(filename)}`);
    // Removed the alert as navigation is now implemented.
  };

  // 定义表格列配置
  const columns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string) => (
        <Text strong ellipsis={{ tooltip: text }}>
          {text}
        </Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => (
        <Text type="secondary">{text || '未知'}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: { filename: string }) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="primary"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handleView(record.filename)}
            />
          </Tooltip>
          <Tooltip title="导出为 Excel">
            <Button
              icon={<FileExcelOutlined />}
              size="small"
              onClick={async () => { // Add async handler for export
                message.loading({ content: `正在导出 ${record.filename}...`, key: 'exporting' });
                try {
                  if (window.electronAPI) {
                    const result = await window.electronAPI.invoke('export-db-to-excel', record.filename);
                    if (result.success) {
                      message.success({ content: result.message, key: 'exporting', duration: 5 });
                    } else {
                      message.error({ content: result.message || '导出失败', key: 'exporting', duration: 5 });
                    }
                  } else {
                    throw new Error("Electron API 不可用");
                  }
                } catch (err: any) {
                  message.error({ content: `导出错误: ${err.message}`, key: 'exporting', duration: 5 });
                }
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个结果文件吗？"
            description="此操作不可恢复！"
            onConfirm={() => handleDelete(record.filename)}
            okText="确定"
            cancelText="取消"
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
  ];


  // 准备表格数据
  const tableData = dbFiles.map((filename, index) => ({
    key: index,
    filename: filename,
    createdAt: '—', // 暂时没有创建时间信息，后续可以从文件属性中获取
  }));

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            variant="borderless"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <Title level={2}>
              <DatabaseOutlined /> 结果管理
            </Title>
            <Paragraph>
              查看和管理已保存的算法计算结果。您可以查看详细信息或删除不再需要的结果文件。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            variant="borderless"
            title={
              <Space>
                <Badge status="processing" />
                <span>已保存结果</span>
                <Badge
                  count={dbFiles.length}
                  style={{ backgroundColor: '#52c41a' }}
                />
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={fetchDbFiles}
                loading={isLoading}
              >
                刷新列表
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
              columns={columns}
              dataSource={tableData}
              loading={isLoading}
              pagination={{
                hideOnSinglePage: true,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => `共 ${total} 条记录`,
              }}
              locale={{
                emptyText: '没有找到保存的结果文件',
              }}
              size="middle"
              rowKey="key"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DbManagerPage;
