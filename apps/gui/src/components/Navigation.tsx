import { Layout, Menu } from 'antd';
import { HomeOutlined, GithubOutlined, RobotOutlined, FileTextOutlined, ApiOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Sider } = Layout;

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/service',
      icon: <HomeOutlined />,
      label: '服务控制',
    },
    {
      key: '/git',
      icon: <GithubOutlined />,
      label: 'Git 管理',
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '日志查看',
    },
    {
      key: '/bridge',
      icon: <ApiOutlined />,
      label: 'Bridge 命令',
    },
    {
      key: '/agent',
      icon: <RobotOutlined />,
      label: 'AI Agent',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Sider
      theme="light"
      style={{
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        borderRight: '1px solid #f0f0f0',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 'bold',
          fontSize: 18,
          color: '#1890ff',
        }}
      >
        Wujie AI
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ borderRight: 0, marginTop: 8 }}
      />
    </Sider>
  );
};

export default Navigation;
