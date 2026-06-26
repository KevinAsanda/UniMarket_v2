import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  IconBook2,
  IconTag,
  IconPackage,
  IconSettings,
  IconLogout,
  IconMenu2,
  IconX,
  IconShieldCheckFilled,
} from '@tabler/icons-react';

export const Navbar = () => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu  = () => setIsOpen(false);

  const isVerified = user?.card_verified && user?.face_verified;

  const getInitials = () => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  return (
    <>
      <nav className="topbar">
        {/* Logo */}
        <Link className="logo" to="/" style={{ textDecoration: 'none' }} aria-label="UniMarket Home">
          <img src="/images/1.svg" alt="UniMarket" style={{ height: '30px', width: 'auto' }} />
        </Link>

        {/* Desktop Nav Links */}
        <div className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <IconBook2 size={16} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Catalogue
          </NavLink>
          <NavLink
            to="/sell"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <IconTag size={16} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Sell
          </NavLink>
          <NavLink
            to="/activity"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <IconPackage size={16} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Activity
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <IconSettings size={16} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Settings
          </NavLink>
        </div>

        {/* Right: user area + sign out */}
        <div className="nav-right">
          <NavLink
            to="/settings"
            className="user-pill"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
            title={isVerified ? 'Verified Account — View Settings' : 'Verify your identity — View Settings'}
          >
            <span className="user-avatar" id="userAvatar" aria-hidden="true"
              style={{ position: 'relative' }}>
              {getInitials()}
              {isVerified && (
                <span style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--spotify-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <IconShieldCheckFilled size={14} color="var(--spotify-green)" />
                </span>
              )}
            </span>
            <span className="user-name" id="username">
              {user ? `${user.first_name} ${user.last_name}` : 'Loading…'}
              {isVerified && (
                <IconShieldCheckFilled
                  size={13}
                  color="var(--spotify-green)"
                  style={{ marginLeft: '5px', verticalAlign: 'middle', flexShrink: 0 }}
                  title="Verified student"
                />
              )}
            </span>
          </NavLink>
          <button className="btn-signout" onClick={signOut} aria-label="Sign out">
            <IconLogout size={14} strokeWidth={2} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
            Sign Out
          </button>
          <button
            className="hamburger"
            id="hamburgerBtn"
            onClick={toggleMenu}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <IconX size={20} strokeWidth={2} /> : <IconMenu2 size={20} strokeWidth={2} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer${isOpen ? ' open' : ''}`} id="mobileDrawer">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
          onClick={closeMenu}
        >
          <IconBook2 size={18} strokeWidth={2} />
          Catalogue
        </NavLink>
        <NavLink
          to="/sell"
          className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
          onClick={closeMenu}
        >
          <IconTag size={18} strokeWidth={2} />
          Sell
        </NavLink>
        <NavLink
          to="/activity"
          className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
          onClick={closeMenu}
        >
          <IconPackage size={18} strokeWidth={2} />
          Activity
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
          onClick={closeMenu}
        >
          <IconSettings size={18} strokeWidth={2} />
          Settings
          {isVerified && (
            <IconShieldCheckFilled size={14} color="var(--spotify-green)" style={{ marginLeft: 'auto' }} />
          )}
        </NavLink>
        <hr style={{ borderColor: 'var(--spotify-border)', margin: '8px 0' }} />
        <button
          className="drawer-signout"
          onClick={() => { closeMenu(); signOut(); }}
        >
          <IconLogout size={16} strokeWidth={2} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Sign Out
        </button>
      </div>

      {isOpen && (
        <div
          className="drawer-overlay open"
          id="drawerOverlay"
          onClick={closeMenu}
        />
      )}
    </>
  );
};
