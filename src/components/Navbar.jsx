import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  IconBook2,
  IconTag,
  IconPackage,
  IconUser,
  IconLogout,
  IconMenu2,
  IconX,
} from '@tabler/icons-react';

export const Navbar = () => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const getInitials = () => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  return (
    <>
      <nav className="topbar">
        {/* Logo — SVG wordmark only, no separate text label */}
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
        </div>

        {/* Right: user area + sign out */}
        <div className="nav-right">
          <div className="user-pill">
            <span className="user-avatar" id="userAvatar" aria-hidden="true">
              {getInitials()}
            </span>
            <span className="user-name" id="username">
              {user ? `${user.first_name} ${user.last_name}` : 'Loading...'}
            </span>
          </div>
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
