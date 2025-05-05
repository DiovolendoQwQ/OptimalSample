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

// The component uses Ant Design’s Form API and does not require an additional FormState interface

const ParamForm: React.FC<ParamFormProps> = ({ onSubmit, isSubmitting }) => {
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);

  // Initialize form values
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

  // Random sample selection handler
  const handleRandomSelect = useCallback(() => {
    setError(null);
    try {
      //Get values from the form
      const values = form.getFieldsValue();
      const mVal = parseInt(values.m, 10);
      const nVal = parseInt(values.n, 10);

      if (isNaN(mVal) || isNaN(nVal) || mVal <= 0 || nVal <= 0) {
        throw new Error("Please enter valid positive integers for 'M' and 'N'.");
      }
      if (nVal > mVal) {
        throw new Error("'N'(number of samples to select) cannot be greater than 'M' (total number of samples).");
      }
      if (nVal < 7 || nVal > 25 || mVal < 45 || mVal > 54) {
        console.warn("M or N is outside typical project constraints (M: 45–54, N: 7–25), but processing will continue.");
      }

      // Generate random samples
      const allPossible = Array.from({ length: mVal }, (_, i) => i + 1);
      const selectedSamples: number[] = [];
      while (selectedSamples.length < nVal) {
        const randomIndex = Math.floor(Math.random() * allPossible.length);
        const sample = allPossible.splice(randomIndex, 1)[0];
        selectedSamples.push(sample);
      }

      // Format and set form values
      const formattedSamples = selectedSamples.sort((a, b) => a - b).map(s => String(s).padStart(2, '0')).join(',');
      form.setFieldValue('samples', formattedSamples);

    } catch (err: any) {
      console.error("Random selection error:", err);
      setError(err.message || "Failed to generate random samples.");
    }
  }, [form]);


  // Form submission is handled via Ant Design’s Form.onFinish, so a separate handleSubmit function is not needed

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
              throw new Error("All parameters must be valid numbers.");
            }
            if (workersNum <= 0) {
              throw new Error("Workers must be a positive integer.");
            }
            if (beamWidthNum <= 0) {
              throw new Error("Beam width must be a positive integer.");
            }

            const sampleParts = values.samples.split(',').map((p: string) => p.trim()).filter((p: string) => p !== '');
            const samplesNum = sampleParts.map(Number);

            if (samplesNum.some(isNaN)) {
              throw new Error("Sample input contains non-numeric values.");
            }
            if (sampleParts.length !== nNum || samplesNum.length === 0) {
              throw new Error(`、Sample input is invalid, empty, or does not match N(${nNum}). Please use comma-separated numbers.`);
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
            console.error("Form submission error:", err);
            setError(err.message || "An unknown error occurred during submission");
          }
        }}
      >
        <Title level={4} style={{ marginBottom: 16 }}>
          <ExperimentOutlined /> Algorithm Parameter Settings
        </Title>
        <Divider style={{ margin: '0 0 16px 0' }} />

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="M (total number of samples, 45-54)"
              name="m"
              rules={[{ required: true, message: 'Please enter a value for M' }]}
            >
              <InputNumber min={45} max={54} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="N (number of samples to select, 7-25)"
              name="n"
              rules={[{ required: true, message: 'Please enter N value' }]}
            >
              <InputNumber min={7} max={25} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="K (group size, 4-7)"
              name="k"
              rules={[{ required: true, message: 'Please enter K value' }]}
            >
              <InputNumber min={4} max={7} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="J (size of j-subset to check)"
              name="j"
              rules={[{ required: true, message: 'Please enter J value' }]}
            >
              <InputNumber style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="S (internal subset size, 3-7)"
              name="s"
              rules={[{ required: true, message: 'Please enter S value' }]}
            >
              <InputNumber min={3} max={7} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
        </Row>

        <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>
          <SettingOutlined /> Advanced Settings
        </Title>
        <Divider style={{ margin: '0 0 16px 0' }} />

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="T (coverage threshold)"
              name="t"
              rules={[{ required: true, message: 'Please enter T value' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="Workers (number of CPU cores)"
              name="workers"
              rules={[{ required: true, message: 'Please enter a value for Workers' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="Beam Width"
              name="beamWidth"
              rules={[{ required: true, message: 'Please enter a value for Beam Width' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} disabled={isSubmitting} />
            </Form.Item>
          </Col>
        </Row>

        <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>
          <ThunderboltOutlined /> Sample Selection
        </Title>
        <Divider style={{ margin: 'Sample input invalid 0 0 16px 0' }} />

        <Form.Item
          label="Selected samples (comma-separated, e.g.: 01,02,...)"
          name="samples"
          rules={[{ required: true, message: 'Please enter samples' }]}
          validateStatus={error ? 'error' : ''}
        >
          <Input.TextArea
            rows={3}
            disabled={isSubmitting}
            placeholder={`Enter ${form.getFieldValue('n') || 'N'}comma-separated numbers`}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>

        {error && (
          <Alert
            message="Input Error"
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
               Randomly Select Samples
            </Button>

            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              icon={<ThunderboltOutlined />}
              size="large"
              style={{ minWidth: 150 }}
            >
              {isSubmitting ? 'Generating...' : 'Generate Optimal Combination'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Card>
  );
};

export default ParamForm;
