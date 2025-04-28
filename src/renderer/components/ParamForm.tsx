import React, { useState, useCallback } from 'react';
import { AlgorithmParams } from '@/shared/types';
import { Form, Input, InputNumber, Button, Card, Row, Col, Space, Typography, Divider, Alert } from 'antd';
import { ExperimentOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

// Define the props for the form component
interface ParamFormProps {
  onSubmit: (params: AlgorithmParams) => Promise<void>; // Function to call when form is submitted
  isSubmitting: boolean; // Flag to disable form during submission
}

// 组件使用Ant Design的Form API，不需要额外的FormState接口

const ParamForm: React.FC<ParamFormProps> = ({ onSubmit, isSubmitting }) => {
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);

  // 初始化表单值
  const initialValues = {
    m: '45',
    n: '7',
    k: '6',
    j: '5',
    s: '5',
    t: '1',
    workers: '8',
    beamWidth: '1',
    samples: '',
  };

  // 随机选择样本处理函数
  const handleRandomSelect = useCallback(() => {
    setError(null);
    try {
      // 从表单获取值
      const values = form.getFieldsValue();
      const mVal = parseInt(values.m, 10);
      const nVal = parseInt(values.n, 10);

      if (isNaN(mVal) || isNaN(nVal) || mVal <= 0 || nVal <= 0) {
        throw new Error("请为'M'和'N'输入有效的正整数。");
      }
      if (nVal > mVal) {
        throw new Error("'N'(要选择的样本数)不能大于'M'(总样本数)。");
      }
      if (nVal < 7 || nVal > 25 || mVal < 45 || mVal > 54) {
        console.warn("M或N超出典型项目约束(M: 45-54, N: 7-25)，但将继续处理。");
      }

      // 生成随机样本
      const allPossible = Array.from({ length: mVal }, (_, i) => i + 1);
      const selectedSamples: number[] = [];
      while (selectedSamples.length < nVal) {
        const randomIndex = Math.floor(Math.random() * allPossible.length);
        const sample = allPossible.splice(randomIndex, 1)[0];
        selectedSamples.push(sample);
      }

      // 格式化并设置表单值
      const formattedSamples = selectedSamples.sort((a, b) => a - b).map(s => String(s).padStart(2, '0')).join(',');
      form.setFieldValue('samples', formattedSamples);

    } catch (err: any) {
      console.error("随机选择错误:", err);
      setError(err.message || "生成随机样本失败。");
    }
  }, [form]);


  // 表单提交通过Ant Design的Form.onFinish处理，不需要单独的handleSubmit函数

  return (
    <Card variant="borderless" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={async (values) => {
          setError(null);

          try {
            const mNum = parseInt(values.m, 10);
            const nNum = parseInt(values.n, 10);
            const kNum = parseInt(values.k, 10);
            const jNum = parseInt(values.j, 10);
            const sNum = parseInt(values.s, 10);
            const tNum = parseInt(values.t, 10);
            const workersNum = parseInt(values.workers, 10);
            const beamWidthNum = parseInt(values.beamWidth, 10);

            if (isNaN(mNum) || isNaN(nNum) || isNaN(kNum) || isNaN(jNum) || isNaN(sNum) || isNaN(tNum) || isNaN(workersNum) || isNaN(beamWidthNum)) {
              throw new Error("所有参数必须是有效数字");
            }
            if (workersNum <= 0) {
              throw new Error("Workers必须是正整数");
            }
            if (beamWidthNum <= 0) {
              throw new Error("Beam width必须是正整数");
            }

            const sampleParts = values.samples.split(',').map((p: string) => p.trim()).filter((p: string) => p !== '');
            const samplesNum = sampleParts.map(Number);

            if (samplesNum.some(isNaN)) {
              throw new Error("样本输入包含非数字值");
            }
            if (sampleParts.length !== nNum || samplesNum.length === 0) {
              throw new Error(`样本输入无效、为空或与N(${nNum})不匹配。请使用逗号分隔的数字。`);
            }

            const params: AlgorithmParams = {
              m: mNum,
              n: nNum,
              k: kNum,
              j: jNum,
              s: sNum,
              t: tNum,
              workers: workersNum,
              beamWidth: beamWidthNum,
              samples: samplesNum,
            };

            await onSubmit(params);
          } catch (err: any) {
            console.error("表单提交错误:", err);
            setError(err.message || "提交过程中发生未知错误");
          }
        }}
      >
        <Title level={4} style={{ marginBottom: 16 }}>
          <ExperimentOutlined /> 算法参数设置
        </Title>
        <Divider style={{ margin: '0 0 16px 0' }} />

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="M (总样本数, 45-54)"
              name="m"
              rules={[{ required: true, message: '请输入M值' }]}
            >
              <InputNumber min={45} max={54} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="N (选择样本数, 7-25)"
              name="n"
              rules={[{ required: true, message: '请输入N值' }]}
            >
              <InputNumber min={7} max={25} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="K (组大小, 4-7)"
              name="k"
              rules={[{ required: true, message: '请输入K值' }]}
            >
              <InputNumber min={4} max={7} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="J (检查子集大小)"
              name="j"
              rules={[{ required: true, message: '请输入J值' }]}
            >
              <InputNumber style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="S (内部子集大小, 3-7)"
              name="s"
              rules={[{ required: true, message: '请输入S值' }]}
            >
              <InputNumber min={3} max={7} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
        </Row>

        <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>
          <SettingOutlined /> 高级设置
        </Title>
        <Divider style={{ margin: '0 0 16px 0' }} />

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="T (覆盖阈值)"
              name="t"
              rules={[{ required: true, message: '请输入T值' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="Workers (CPU核心数)"
              name="workers"
              rules={[{ required: true, message: '请输入Workers值' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="Beam Width"
              name="beamWidth"
              rules={[{ required: true, message: '请输入Beam Width值' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
        </Row>

        <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>
          <ThunderboltOutlined /> 样本选择
        </Title>
        <Divider style={{ margin: '0 0 16px 0' }} />

        <Form.Item
          label="选择的样本 (逗号分隔, 例如: 01,02,...)"
          name="samples"
          rules={[{ required: true, message: '请输入样本' }]}
          validateStatus={error ? 'error' : ''}
        >
          <Input.TextArea
            rows={3}
            disabled={isSubmitting}
            placeholder={`输入${form.getFieldValue('n') || 'N'}个逗号分隔的数字`}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>

        {error && (
          <Alert
            message="输入错误"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={24} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <Button
              type="default"
              icon={<ExperimentOutlined />}
              onClick={handleRandomSelect}
              disabled={isSubmitting || !form.getFieldValue('m') || !form.getFieldValue('n')}
            >
              随机选择样本
            </Button>

            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              icon={<ThunderboltOutlined />}
              size="large"
              style={{ minWidth: 150 }}
            >
              {isSubmitting ? '生成中...' : '生成最优组合'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Card>
  );
};

export default ParamForm;
