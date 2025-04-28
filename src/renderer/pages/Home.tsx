import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Progress, Alert, Typography, theme, Row, Col, Spin } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import ParamForm from '../components/ParamForm'; // Import the form component
import { AlgorithmParams, AlgorithmResult, ProgressUpdate } from '@/shared/types'; // Import AlgorithmResult and ProgressUpdate

const { Title, Text, Paragraph } = Typography;

// Helper function to calculate combinations (nCr)
function combinations(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  // Take advantage of symmetry C(n, k) == C(n, n-k)
  if (k > n / 2) {
    k = n - k;
  }
  let res = 1;
  for (let i = 1; i <= k; ++i) {
    // Use Math.round for potentially safer multiplication order with large numbers
    res = Math.round((res * (n - i + 1)) / i);
    // Check for potential overflow if numbers get very large
    if (!Number.isSafeInteger(res)) {
      console.warn("Binomial coefficient calculation might exceed safe integer limit for n=", n, "k=", k);
      return Number.MAX_SAFE_INTEGER; // Return a large number as an indicator
    }
  }
  return res;
}

const HomePage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null); // For displaying feedback
  // Store full progress update, including message and time
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  const [simulatedPercent, setSimulatedPercent] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID
  const navigate = useNavigate(); // Hook for navigation
  const { token } = theme.useToken(); // 获取主题token

  // Stop the simulation interval
  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 监听算法进度更新 - Only update the message now
  useEffect(() => {
    // 确保electronAPI存在
    if (!window.electronAPI) return;

    // 注册进度更新监听器
    const unsubscribe = window.electronAPI.onAlgorithmProgress((progressData: ProgressUpdate) => {
      // Add console log in the Renderer process to confirm message arrival
      console.log('[Renderer] Received algorithm-progress:', progressData);
      // Store the entire progress update object
      setProgressUpdate(progressData);
    });

    // 组件卸载时取消监听，并清除 interval
    return () => {
      unsubscribe();
      stopSimulation(); // Clean up interval on unmount
    };
  }, [stopSimulation]); // Added stopSimulation dependency

  // Callback function passed to ParamForm
  const handleFormSubmit = useCallback(async (params: AlgorithmParams) => {
    setIsSubmitting(true);
    setSubmissionStatus(null); // Clear previous status
    setProgressUpdate({ percent: 0, message: 'Initializing calculation...' }); // Set initial progress state
    setSimulatedPercent(0); // Reset simulated percentage
    stopSimulation(); // Clear any existing interval
    console.log('HomePage: Submitting params:', params);

    // --- Dynamic Simulation Duration ---
    const numJSubsets = combinations(params.n, params.j);
    let simulationDuration = 5000; // Default 5 seconds
    console.log(`Estimated j-subsets: ${numJSubsets}`); // Log estimated count

    if (numJSubsets > 10000) {
      simulationDuration = 15000; // 15 seconds for large complexity
      console.log("Setting simulation duration to long (15s)");
    } else if (numJSubsets > 1000) {
      simulationDuration = 8000; // 8 seconds for medium complexity
      console.log("Setting simulation duration to medium (8s)");
    } else {
      console.log("Setting simulation duration to short (5s)"); // Keep default for small
    }
    // --- End Dynamic Simulation Duration ---

    const updatesPerSecond = 10;
    const increment = 90 / (simulationDuration / 1000 * updatesPerSecond); // Calculate increment based on dynamic duration

    intervalRef.current = setInterval(() => {
      setSimulatedPercent(prev => {
        const next = prev + increment;
        if (next >= 90) {
          stopSimulation(); // Stop near 90%
          return 90;
        }
        return next;
      });
    }, 1000 / updatesPerSecond);


    try {
      // Access the exposed API from the preload script
      if (window.electronAPI) {
        // --- Call the main process to run the algorithm ---
        const result: AlgorithmResult = await window.electronAPI.invoke('run-algorithm', params);

        // --- Success ---
        stopSimulation(); // Ensure simulation stops
        setSimulatedPercent(100); // Set to 100% on success
        const execTime = result.execution_time ?? 'N/A';
        const workersUsed = result.workers ?? 'N/A';
        // Update progress state to final completion message
        setProgressUpdate({ percent: 100, message: 'Calculation complete!' });
        console.log(`HomePage: Algorithm finished successfully. Execution time: ${execTime}s, Workers: ${workersUsed}`);
        setSubmissionStatus(`Success! Completed in ${execTime}s using ${workersUsed} worker(s).`);

        // Optional navigation could go here
        // navigate('/db');

        // Clear status after a delay
        setTimeout(() => {
          setSubmissionStatus(null);
          // Optionally clear progress after success timeout
          // setProgressUpdate(null);
        }, 5000);

      } else {
        console.error("HomePage: Electron API not found on window object.");
        throw new Error("Electron API is not available. Preload script might have failed.");
      }
    } catch (error: any) {
      console.error("HomePage: Error during algorithm execution or saving:", error);
      // Display error message received from main process or form
      const errorMessage = error.message || 'An unknown error occurred.';
      setSubmissionStatus(`Error: ${errorMessage}`);
      // Update progress state to show error
      setProgressUpdate({ percent: simulatedPercent, message: `Error: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}` });
      stopSimulation(); // Stop simulation on error
    } finally {
      setIsSubmitting(false); // Re-enable form
    }
  }, [navigate]); // Added navigate to dependency array if used

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            variant="borderless"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            <Title level={2}>
              <ExperimentOutlined /> 最优样本选择系统
            </Title>
            <Paragraph>
              输入参数并选择样本以生成最优组合。该系统将帮助您从给定的样本集中选择最佳组合，以满足特定的覆盖要求。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {/* 进度显示 */}
      {isSubmitting && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card variant="borderless" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Spin spinning={true} tip="处理中...">
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
                    {progressUpdate?.message || '初始化中...'}
                  </Paragraph>
                  {progressUpdate?.elapsed_time && (
                    <Text type="secondary">
                      已用时间: {progressUpdate.elapsed_time.toFixed(1)} 秒
                    </Text>
                  )}
                </div>
              </Spin>
            </Card>
          </Col>
        </Row>
      )}

      {/* 状态消息 */}
      {submissionStatus && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Alert
              message={submissionStatus.startsWith('Error') ? '错误' : '成功'}
              description={submissionStatus}
              type={submissionStatus.startsWith('Error') ? 'error' : 'success'}
              showIcon
            />
          </Col>
        </Row>
      )}

      {/* 参数表单 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <ParamForm onSubmit={handleFormSubmit} isSubmitting={isSubmitting} />
        </Col>
      </Row>
    </div>
  );
};

export default HomePage;
